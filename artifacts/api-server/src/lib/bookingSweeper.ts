import { db } from "@workspace/db";
import { bookingsTable, usersTable } from "@workspace/db/schema";
import { and, eq, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { emitToUser } from "./eventBus";
import { notifyUser } from "./notifications";
import { logger } from "./logger";

const NO_SHOW_GRACE_MS = 5 * 60 * 1000;
// Pending bookings (no provider has accepted) auto-cancel after 10 minutes.
const PENDING_GRACE_MS = 10 * 60 * 1000;
// Push the rating reminder 30 minutes after a job completes (only once).
const RATING_REMINDER_MS = 30 * 60 * 1000;
// 2 no-shows in 24h → 60-minute matching cooldown.
const NOSHOW_COOLDOWN_THRESHOLD = 2;
const NOSHOW_COOLDOWN_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// Penalise a provider for a no-show: bump count and, if they cross the 24h
// threshold, place them on a temporary matching cooldown.
export async function applyNoShowPenalty(providerId: string): Promise<void> {
  if (!providerId) return;
  try {
    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, providerId),
    });
    if (!provider) return;
    const within24h = provider.cooldownUntil && provider.cooldownUntil.getTime() > Date.now() - 24 * 60 * 60 * 1000;
    const newCount = (provider.noShowCount || 0) + 1;
    const cooldownUntil = newCount >= NOSHOW_COOLDOWN_THRESHOLD
      ? new Date(Date.now() + NOSHOW_COOLDOWN_MS)
      : within24h ? provider.cooldownUntil : null;
    await db.update(usersTable)
      .set({ noShowCount: newCount, cooldownUntil, updatedAt: new Date() })
      .where(eq(usersTable.id, providerId));
    if (cooldownUntil) {
      emitToUser(providerId, "notification:new", { type: "cooldown", until: cooldownUntil });
      notifyUser({
        userId: providerId,
        title: "Temporary cooldown",
        body: `Multiple no-shows detected. You won't receive new requests until ${cooldownUntil.toLocaleTimeString()}.`,
        type: "system",
        data: { cooldownUntil },
      }).catch(() => undefined);
    }
  } catch (e) {
    logger.error({ err: e, providerId }, "applyNoShowPenalty failed");
  }
}

async function sweepStuckAcceptedBookings(): Promise<number> {
  const cutoff = new Date(Date.now() - NO_SHOW_GRACE_MS);

  // Use createdAt not updatedAt — providers can keep bumping updatedAt by
  // regenerating the start PIN, which would indefinitely defer the sweep.
  const stale = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "accepted"),
        isNull(bookingsTable.providerArrivedAt),
        lt(bookingsTable.createdAt, cutoff)
      )
    );

  if (stale.length === 0) return 0;

  for (const booking of stale) {
    try {
      await db
        .update(bookingsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(bookingsTable.id, booking.id));

      if (booking.providerId) {
        await db
          .update(usersTable)
          .set({ isAvailable: true, updatedAt: new Date() })
          .where(eq(usersTable.id, booking.providerId));
        emitToUser(booking.providerId, "provider:availability", { isAvailable: true, reason: "auto_cancelled" });
        await applyNoShowPenalty(booking.providerId);
      }

      const payload = { bookingId: booking.id, reason: "no_show" };
      emitToUser(booking.customerId, "booking:cancelled", payload);
      emitToUser(booking.providerId, "booking:cancelled", payload);

      notifyUser({
        userId: booking.customerId,
        title: "Booking auto-cancelled",
        body: `${booking.providerName} didn't head over in time. You can re-request the service.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reason: "no_show" },
      }).catch(() => undefined);
      notifyUser({
        userId: booking.providerId,
        title: "Booking auto-cancelled",
        body: `Your accepted ${booking.service} booking was cancelled because no arrival was confirmed within 5 minutes.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reason: "no_show" },
      }).catch(() => undefined);
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: failed to auto-cancel");
    }
  }

  logger.info({ count: stale.length }, "bookingSweeper: auto-cancelled stale accepted bookings");
  return stale.length;
}

// Pending bookings that no provider has picked up after the grace period
// auto-cancel — frees the customer to re-post and keeps stale requests off
// provider feeds.
async function sweepStalePendingBookings(): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS);
  const stale = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "pending"),
        lt(bookingsTable.createdAt, cutoff)
      )
    );
  if (stale.length === 0) return 0;
  for (const booking of stale) {
    try {
      await db
        .update(bookingsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(bookingsTable.id, booking.id));
      const payload = { bookingId: booking.id, reason: "no_provider" };
      emitToUser(booking.customerId, "booking:cancelled", payload);
      notifyUser({
        userId: booking.customerId,
        title: "No providers responded",
        body: `Your ${booking.service} request expired. Try again or broaden your area.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, reason: "no_provider" },
      }).catch(() => undefined);
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: failed to expire pending booking");
    }
  }
  logger.info({ count: stale.length }, "bookingSweeper: expired stale pending bookings");
  return stale.length;
}

// 30 minutes after a job completes, ping the customer to leave a rating —
// once. Stamped on the booking so we never double-prompt.
async function sweepRatingReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - RATING_REMINDER_MS);
  const due = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "completed"),
        isNull(bookingsTable.rating),
        isNull(bookingsTable.ratingReminderSentAt),
        lt(bookingsTable.updatedAt, cutoff)
      )
    );
  if (due.length === 0) return 0;
  for (const booking of due) {
    try {
      await db
        .update(bookingsTable)
        .set({ ratingReminderSentAt: new Date() })
        .where(eq(bookingsTable.id, booking.id));
      notifyUser({
        userId: booking.customerId,
        title: "Rate your experience",
        body: `How was your ${booking.service} job with ${booking.providerName}? Your rating helps the community.`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id, prompt: "rate" },
      }).catch(() => undefined);
      emitToUser(booking.customerId, "notification:new", { bookingId: booking.id, prompt: "rate" });
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: failed to send rating reminder");
    }
  }
  logger.info({ count: due.length }, "bookingSweeper: sent rating reminders");
  return due.length;
}

// Lift cooldowns whose deadline has passed.
async function clearExpiredCooldowns(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(usersTable)
    .set({ cooldownUntil: null, updatedAt: now })
    .where(and(isNotNull(usersTable.cooldownUntil), lt(usersTable.cooldownUntil, now)));
  // Drizzle's update returns no count by default; we just no-op silently.
  void result; void sql;
  return 0;
}

// 60 minutes before a scheduled booking, send a reminder to both customer
// and provider (stamped on the booking to prevent double-firing).
const PRE_JOB_REMINDER_WINDOW_MS = 60 * 60 * 1000; // 1 hour ahead
const PRE_JOB_REMINDER_MIN_MS = 25 * 60 * 1000;   // min 25 min ahead

function parseScheduledDateTime(date: string, time: string): Date | null {
  try {
    // date: "2024-05-03", time: "10:00 AM" or "14:00"
    const combined = `${date} ${time}`;
    const d = new Date(combined);
    if (!isNaN(d.getTime())) return d;
    // fallback: 24h format
    const d2 = new Date(`${date}T${time}`);
    if (!isNaN(d2.getTime())) return d2;
    return null;
  } catch { return null; }
}

async function sweepPreJobReminders(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.status, "accepted"),
        isNull(bookingsTable.preJobReminderSentAt),
        isNotNull(bookingsTable.scheduledDate),
        isNotNull(bookingsTable.scheduledTime),
      )
    );

  if (due.length === 0) return 0;

  let sent = 0;
  for (const booking of due) {
    try {
      const dt = parseScheduledDateTime(
        booking.scheduledDate || "",
        booking.scheduledTime || "",
      );
      if (!dt) continue;

      const msUntil = dt.getTime() - now.getTime();
      if (msUntil < PRE_JOB_REMINDER_MIN_MS || msUntil > PRE_JOB_REMINDER_WINDOW_MS) continue;

      await db
        .update(bookingsTable)
        .set({ preJobReminderSentAt: now })
        .where(eq(bookingsTable.id, booking.id));

      const timeLabel = booking.scheduledTime || "";
      notifyUser({
        userId: booking.customerId,
        title: "Upcoming booking reminder",
        body: `${booking.providerName} is scheduled to arrive at ${timeLabel}. Be ready!`,
        type: "booking",
        link: `/bookings/${booking.id}`,
        data: { bookingId: booking.id },
      }).catch(() => undefined);

      notifyUser({
        userId: booking.providerId,
        title: "Job reminder",
        body: `You have a ${booking.service} job at ${timeLabel}. Head over to ${booking.address} on time!`,
        type: "booking",
        link: `/jobs/${booking.id}`,
        data: { bookingId: booking.id },
      }).catch(() => undefined);

      sent++;
    } catch (e) {
      logger.error({ err: e, bookingId: booking.id }, "bookingSweeper: pre-job reminder failed");
    }
  }

  if (sent > 0) logger.info({ count: sent }, "bookingSweeper: sent pre-job reminders");
  return sent;
}

async function runAllSweeps(): Promise<void> {
  await Promise.allSettled([
    sweepStuckAcceptedBookings(),
    sweepStalePendingBookings(),
    sweepRatingReminders(),
    sweepPreJobReminders(),
    clearExpiredCooldowns(),
  ]);
}

export function startBookingSweeper(): NodeJS.Timeout {
  void runAllSweeps().catch((e) =>
    logger.error({ err: e }, "bookingSweeper: initial run failed")
  );
  const handle = setInterval(() => {
    void runAllSweeps().catch((e) =>
      logger.error({ err: e }, "bookingSweeper: scheduled run failed")
    );
  }, SWEEP_INTERVAL_MS);
  if (typeof handle.unref === "function") handle.unref();
  return handle;
}

