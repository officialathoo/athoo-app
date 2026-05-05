import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { bookingsTable, serviceCategoriesTable, usersTable } from "@workspace/db/schema";
import { and, eq, inArray, desc, not, gte, lt } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { getPlatformSettings } from "../lib/admin";
import { emitToUser, emitToRole, type EventName } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";

function broadcastBookingUpdate(
  booking: any,
  event: EventName = "booking:updated",
  extra: Record<string, unknown> = {},
) {
  if (!booking) return;
  const payload = { booking, ...extra };
  if (booking.customerId) emitToUser(booking.customerId, event, payload);
  if (booking.providerId) emitToUser(booking.providerId, event, payload);
}

const router = Router();

type AllowedStatus = "pending" | "accepted" | "in_progress" | "completed" | "cancelled";

// Job OTP (PIN) lifetime — 3 minutes per spec.
const PIN_TTL_MS = 3 * 60 * 1000;

function pinExpiry(): Date {
  return new Date(Date.now() + PIN_TTL_MS);
}

function isPinExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

// Strict job state-machine. Map every status to the set of valid next statuses.
// Cancellation is allowed from any non-terminal state. `arrived` is represented
// by the providerArrivedAt timestamp on top of the `accepted` status, so it is
// not its own row in this map.
const STATE_TRANSITIONS: Record<AllowedStatus, AllowedStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

function canTransition(from: string | null | undefined, to: AllowedStatus): boolean {
  const current = String(from || "pending") as AllowedStatus;
  if (!(current in STATE_TRANSITIONS)) return false;
  return STATE_TRANSITIONS[current].includes(to);
}

function generateId(): string {
  return crypto.randomUUID();
}

function generatePublicId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `ATH-${y}${m}${d}-${rand}`;
}

function generatePin(): string {
  return crypto.randomInt(1000, 10000).toString();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return ["pending", "accepted", "in_progress", "completed", "cancelled"].includes(String(value));
}

async function getBookingOr404(id: string, res: Response) {
  const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, id) });
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }
  return booking;
}

function sanitizeBookingForViewer(
  booking: Record<string, any>,
  viewerRole: string,
  viewerUserId: string,
) {
  const safeBooking = { ...booking } as Record<string, any>;
  const isProviderViewer = viewerRole === "provider" && booking.providerId === viewerUserId;

  if (!isProviderViewer && viewerRole !== "admin") {
    delete safeBooking.customerPhone;
    delete safeBooking.providerPhone;
  }

  if (isProviderViewer) {
    delete safeBooking.startPin;
    delete safeBooking.completePin;
  }

  return safeBooking;
}

async function enrichBookings(bookings: any[], role: string, userId: string) {
  const uniqueIds = [...new Set(bookings.flatMap((b: any) => [b.customerId, b.providerId]))] as string[];
  const profiles = uniqueIds.length
    ? await db.select({
        id: usersTable.id,
        profileImage: usersTable.profileImage,
        profileColor: usersTable.profileColor,
      }).from(usersTable).where(inArray(usersTable.id, uniqueIds))
    : [];

  const profileMap = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile])
  );

  return bookings.map((b: any) =>
    sanitizeBookingForViewer(
      {
        ...b,
        customerProfileImage: profileMap[b.customerId]?.profileImage ?? null,
        providerProfileImage: profileMap[b.providerId]?.profileImage ?? null,
        providerProfileColor: profileMap[b.providerId]?.profileColor ?? null,
      },
      role,
      userId,
    )
  );
}

async function applyCompletionCommission(bookingId: string) {
  const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
  if (!booking) return null;

  if (Number(booking.commissionAmount || 0) > 0 || Number(booking.commissionRate || 0) > 0) {
    return booking;
  }

  const settings = await getPlatformSettings();
  const price = Number(booking.price || 0);
  const commissionRate = Number(settings.commissionRate || 0);
  const commissionAmount = Math.max(0, Math.round((price * commissionRate) / 100));
  const providerAmount = Math.max(0, price - commissionAmount);

  // Wrap in a DB transaction to prevent race conditions when multiple bookings
  // complete simultaneously for the same provider (prevents double-counting commission).
  await db.transaction(async (tx) => {
    // Re-read the provider inside the transaction for an up-to-date pendingCommission.
    const provider = await tx.query.usersTable.findFirst({ where: eq(usersTable.id, booking.providerId) });
    if (!provider) return;

    const nextPending = Number(provider.pendingCommission || 0) + commissionAmount;
    const commissionLimit = Number(provider.commissionLimit || settings.defaultCommissionLimit || 5000);
    const shouldBlock = nextPending >= commissionLimit;

    await tx.update(bookingsTable).set({
      commissionRate,
      commissionAmount,
      providerAmount,
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, bookingId));

    await tx.update(usersTable).set({
      totalJobs: Number(provider.totalJobs || 0) + 1,
      totalCommission: Number(provider.totalCommission || 0) + commissionAmount,
      pendingCommission: nextPending,
      isBlocked: shouldBlock,
      blockedReason: shouldBlock ? "Commission due limit reached. Please clear your Athoo dues." : null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, provider.id));
  });

  return await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
}

router.get("/summary", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    let bookings: { status: string; price: number | null }[] = [];
    if (role === "customer") {
      bookings = await db.select({ status: bookingsTable.status, price: bookingsTable.price })
        .from(bookingsTable).where(eq(bookingsTable.customerId, userId));
    } else if (role === "provider") {
      bookings = await db.select({ status: bookingsTable.status, price: bookingsTable.price })
        .from(bookingsTable).where(eq(bookingsTable.providerId, userId));
    }
    const total = bookings.length;
    const completed = bookings.filter((b) => b.status === "completed").length;
    const active = bookings.filter((b) => ["accepted", "in_progress", "pending"].includes(b.status)).length;
    const totalSpent = bookings
      .filter((b) => b.status === "completed")
      .reduce((s, b) => s + (Number(b.price) || 0), 0);
    const totalEarned = role === "provider" ? totalSpent : undefined;
    res.json({ total, completed, active, totalSpent: role === "customer" ? totalSpent : undefined, totalEarned });
  } catch (e) {
    logger.error({ err: e }, "bookings summary error");
    res.status(500).json({ error: "Failed to load summary" });
  }
});

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const bookings = role === "customer"
      ? await db.select().from(bookingsTable).where(eq(bookingsTable.customerId, userId)).orderBy(desc(bookingsTable.createdAt)).limit(limit).offset(offset)
      : role === "provider"
      ? await db.select().from(bookingsTable).where(eq(bookingsTable.providerId, userId)).orderBy(desc(bookingsTable.createdAt)).limit(limit).offset(offset)
      : await db.select().from(bookingsTable).orderBy(desc(bookingsTable.createdAt)).limit(limit).offset(offset);

    const enriched = await enrichBookings(bookings, role, userId);
    res.json({ bookings: enriched, limit, offset, hasMore: bookings.length === limit });
  } catch (e) {
    logger.error({ err: e }, "bookings list error");
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;

    const userId = req.user!.userId;
    if (req.user!.role !== "admin" && booking.customerId !== userId && booking.providerId !== userId) {
      res.status(403).json({ error: "You can only view your own bookings" });
      return;
    }

    res.json({ booking: sanitizeBookingForViewer(booking as any, req.user!.role, userId) });
  } catch (e) {
    logger.error({ err: e }, "booking get error");
    res.status(500).json({ error: "Failed to load booking" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (role !== "customer") {
      res.status(403).json({ error: "Only customers can create bookings" });
      return;
    }

    const {
      providerId,
      service,
      serviceIcon,
      description,
      attachment,
      address,
      scheduledDate,
      scheduledTime,
      price,
      pickedLat,
      pickedLng,
      customerLat,
      customerLng,
      latitude,
      longitude,
    } = req.body;

    if (!providerId || !service || !address || !scheduledDate || !scheduledTime) {
      res.status(400).json({ error: "providerId, service, address, scheduledDate, and scheduledTime are required" });
      return;
    }

    if (providerId === userId) {
      res.status(400).json({ error: "You cannot book yourself" });
      return;
    }

    // Load platform settings once for all policy enforcement below
    const settings = await getPlatformSettings();

    // Require customer GPS coordinates — enforced server-side regardless of client
    const parsedPickedLat = toNumber(pickedLat) ?? toNumber(customerLat) ?? toNumber(latitude);
    const parsedPickedLng = toNumber(pickedLng) ?? toNumber(customerLng) ?? toNumber(longitude);
    if (parsedPickedLat === null || parsedPickedLng === null) {
      res.status(400).json({ error: "Your location is required to create a booking. Please enable location access in your app settings." });
      return;
    }

    // Enforce minimum booking notice window from admin settings
    const scheduledDateTime = new Date(`${String(scheduledDate)}T${String(scheduledTime).slice(0, 5)}`);
    if (!isNaN(scheduledDateTime.getTime()) && settings.minBookingNoticeHours > 0) {
      const minNoticeMs = settings.minBookingNoticeHours * 60 * 60 * 1000;
      if (scheduledDateTime.getTime() < Date.now() + minNoticeMs) {
        res.status(400).json({ error: `Bookings must be scheduled at least ${settings.minBookingNoticeHours} hour(s) in advance.` });
        return;
      }
    }

    // Enforce daily booking limit per customer from admin settings
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const todayBookingsCount = await db
      .select({ id: bookingsTable.id })
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.customerId, userId),
        not(eq(bookingsTable.status, "cancelled")),
        gte(bookingsTable.createdAt, todayStart),
        lt(bookingsTable.createdAt, tomorrowStart)
      ));
    if (todayBookingsCount.length >= settings.maxBookingsPerDay) {
      res.status(429).json({ error: `You can only create ${settings.maxBookingsPerDay} booking(s) per day.` });
      return;
    }

    const customer = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, providerId) });

    if (!customer || !provider) {
      res.status(400).json({ error: "Invalid customer or provider" });
      return;
    }
    if (provider.role !== "provider") {
      res.status(400).json({ error: "Selected user is not a provider" });
      return;
    }
    if (provider.isDeactivated) {
      res.status(400).json({ error: "This provider account is not active" });
      return;
    }
    if (provider.isBlocked || !provider.isAvailable) {
      res.status(400).json({ error: provider.blockedReason || "This provider cannot receive new bookings right now." });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(400).json({ error: "This provider has not been verified yet and cannot accept bookings." });
      return;
    }

    // Fetch visitCharge from category; fall back to platform default if not set
    const categorySlug = typeof req.body.categorySlug === "string" ? req.body.categorySlug.trim() : null;
    let visitCharge = 0;
    if (categorySlug) {
      const category = await db.query.serviceCategoriesTable.findFirst({
        where: eq(serviceCategoriesTable.slug, categorySlug),
        columns: { visitCharge: true },
      });
      visitCharge = Number(category?.visitCharge ?? 0);
    }
    if (visitCharge === 0) visitCharge = settings.defaultVisitCharge;

    const parsedPrice = toNumber(price);
    const parsedCustomerLat = toNumber(customerLat) ?? parsedPickedLat;
    const parsedCustomerLng = toNumber(customerLng) ?? parsedPickedLng;

    const booking = {
      id: generateId(),
      publicId: generatePublicId(),
      customerId: userId,
      customerName: customer.name,
      customerPhone: customer.phone,
      providerId,
      providerName: provider.name,
      providerPhone: provider.phone,
      service: String(service).trim(),
      serviceIcon: serviceIcon || "tool",
      description: description || null,
      attachment: attachment || null,
      address: String(address).trim(),
      scheduledDate: String(scheduledDate),
      scheduledTime: String(scheduledTime),
      status: "pending",
      price: parsedPrice,
      commissionAmount: 0,
      providerAmount: parsedPrice,
      commissionRate: 0,
      visitCharge,
      categorySlug: categorySlug || null,
      pickedLat: parsedPickedLat,
      pickedLng: parsedPickedLng,
      customerLat: parsedCustomerLat,
      customerLng: parsedCustomerLng,
      providerLat: null,
      providerLng: null,
      providerAccuracy: null,
      providerUpdatedAt: null,
      providerArrivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(bookingsTable).values(booking);

    emitToUser(providerId, "booking:new", { booking });
    emitToUser(userId, "booking:updated", { booking });
    // Broadcast to all admin sockets so the live admin dashboard updates without polling.
    emitToRole("admin", "admin:event", { type: "booking:new", booking });
    notifyUser({
      userId: providerId,
      title: "New booking request",
      body: `${customer.name} requested ${booking.service}`,
      type: "booking",
      link: `/jobs/${booking.id}`,
      data: { bookingId: booking.id, customerId: userId },
    }).catch(() => undefined);

    res.json({ booking: sanitizeBookingForViewer(booking as any, role, userId) });
  } catch (e) {
    logger.error({ err: e }, "booking create error");
    res.status(500).json({ error: "Failed to create booking" });
  }
});

router.patch("/:id/status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { status, price } = req.body as { status: AllowedStatus; price?: number };
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (!isAllowedStatus(status)) {
      res.status(400).json({ error: "Invalid booking status" });
      return;
    }

    const existing = await getBookingOr404(req.params.id as string, res);
    if (!existing) return;

    const isCustomerOwner = existing.customerId === userId;
    const isProviderOwner = existing.providerId === userId;

    if (role !== "admin" && !isCustomerOwner && !isProviderOwner) {
      res.status(403).json({ error: "You can only update your own bookings" });
      return;
    }

    if (status === "accepted") {
      if (role !== "provider" || !isProviderOwner) {
        res.status(403).json({ error: "Only the assigned provider can accept this booking" });
        return;
      }
      const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, existing.providerId) });
      if (!provider || provider.isBlocked || provider.isDeactivated) {
        res.status(400).json({ error: provider?.blockedReason || "Provider cannot accept jobs right now" });
        return;
      }
      if (provider.verificationStatus !== "approved") {
        res.status(403).json({ error: "Your account must be verified before you can accept jobs." });
        return;
      }
    }

    if (["in_progress", "completed"].includes(status) && role !== "admin") {
      res.status(400).json({ error: "Use the secure PIN verification actions to start or complete a booking" });
      return;
    }

    // Enforce cancellation window — customers cannot cancel too close to scheduled time (admin can always override)
    if (status === "cancelled" && role === "customer" && isCustomerOwner) {
      const cancSettings = await getPlatformSettings();
      if (cancSettings.bookingCancellationWindowHours > 0 && existing.scheduledDate && existing.scheduledTime) {
        const scheduledDT = new Date(`${existing.scheduledDate}T${String(existing.scheduledTime).slice(0, 5)}`);
        if (!isNaN(scheduledDT.getTime())) {
          const windowMs = cancSettings.bookingCancellationWindowHours * 60 * 60 * 1000;
          if (scheduledDT.getTime() - Date.now() < windowMs) {
            res.status(400).json({ error: `Bookings cannot be cancelled within ${cancSettings.bookingCancellationWindowHours} hour(s) of the scheduled time. Please contact support.` });
            return;
          }
        }
      }
    }

    // Strict state-machine enforcement (admins can override).
    if (role !== "admin" && !canTransition(existing.status, status)) {
      res.status(400).json({
        error: `Invalid transition: '${existing.status}' → '${status}'`,
      });
      return;
    }

    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    const parsedPrice = toNumber(price);
    if (parsedPrice !== null) updates.price = parsedPrice;
    if (status === "accepted") {
      updates.startPin = existing.startPin || generatePin();
      if (!existing.startPinExpiresAt || isPinExpired(existing.startPinExpiresAt)) {
        updates.startPinExpiresAt = pinExpiry();
      }
    }

    await db.update(bookingsTable).set(updates).where(eq(bookingsTable.id, req.params.id as string));
    // If we cancelled out of an in-progress job, free the provider so they
    // aren't stuck "busy" with no active booking.
    if (status === "cancelled" && existing.status === "in_progress") {
      await db.update(usersTable)
        .set({ isAvailable: true, updatedAt: new Date() })
        .where(eq(usersTable.id, existing.providerId));
      emitToUser(existing.providerId, "provider:availability", { isAvailable: true, reason: "cancelled" });
    }
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });

    if (updated) {
      const eventName: EventName =
        status === "cancelled" ? "booking:cancelled" : "booking:status";
      broadcastBookingUpdate(updated, eventName, { status });

      if (status === "accepted") {
        notifyUser({
          userId: updated.customerId,
          title: "Booking accepted",
          body: `${updated.providerName} accepted your ${updated.service} booking`,
          type: "booking",
          link: `/bookings/${updated.id}`,
          data: { bookingId: updated.id },
        }).catch(() => undefined);
      } else if (status === "cancelled") {
        const recipientId =
          isProviderOwner ? updated.customerId : updated.providerId;
        const actor = isProviderOwner ? updated.providerName : updated.customerName;
        notifyUser({
          userId: recipientId,
          title: "Booking cancelled",
          body: `${actor} cancelled the ${updated.service} booking`,
          type: "booking",
          link: `/bookings/${updated.id}`,
          data: { bookingId: updated.id },
        }).catch(() => undefined);
      }
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "booking status update error");
    res.status(500).json({ error: "Failed to update booking" });
  }
});

router.patch("/:id/live-location", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { providerLat, providerLng, providerAccuracy = null, providerUpdatedAt = new Date().toISOString() } = req.body as any;

    if (role !== "provider") {
      res.status(403).json({ error: "Only providers can update live location" });
      return;
    }

    const parsedProviderLat = toNumber(providerLat);
    const parsedProviderLng = toNumber(providerLng);
    const parsedProviderAccuracy = toNumber(providerAccuracy);
    if (parsedProviderLat == null || parsedProviderLng == null) {
      res.status(400).json({ error: "providerLat and providerLng are required numbers" });
      return;
    }

    const existing = await getBookingOr404(id, res);
    if (!existing) return;
    if (existing.providerId !== userId) {
      res.status(403).json({ error: "You can only update your own booking location" });
      return;
    }

    await db.update(bookingsTable).set({
      providerLat: parsedProviderLat,
      providerLng: parsedProviderLng,
      providerAccuracy: parsedProviderAccuracy,
      providerUpdatedAt: new Date(providerUpdatedAt),
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, id));

    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, id) });

    if (updated?.customerId) {
      emitToUser(updated.customerId, "booking:location", {
        bookingId: id,
        providerLat: parsedProviderLat,
        providerLng: parsedProviderLng,
        providerAccuracy: parsedProviderAccuracy,
        providerUpdatedAt: updated.providerUpdatedAt,
      });
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "booking live location update error");
    res.status(500).json({ error: "Failed to update live location" });
  }
});

router.post("/:id/arrived", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (role !== "provider" || booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can mark arrival" });
      return;
    }
    if (!["accepted", "in_progress"].includes(String(booking.status))) {
      res.status(400).json({ error: "Only accepted or in-progress bookings can be marked arrived" });
      return;
    }

    await db.update(bookingsTable).set({ providerArrivedAt: new Date(), updatedAt: new Date() }).where(eq(bookingsTable.id, req.params.id as string));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });

    if (updated) {
      broadcastBookingUpdate(updated, "booking:arrived");
      notifyUser({
        userId: updated.customerId,
        title: "Provider arrived",
        body: `${updated.providerName} has arrived at your location`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      }).catch(() => undefined);
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "booking arrived error");
    res.status(500).json({ error: "Failed to mark provider arrival" });
  }
});

router.post("/:id/generate-start-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    const userId = req.user!.userId;
    const role = req.user!.role;
    // Provider asks for / regenerates the PIN; customer can only view it via the booking record.
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can prepare a start PIN" });
      return;
    }
    if (booking.status !== "accepted") {
      res.status(400).json({ error: "Start PIN can only be prepared for accepted bookings" });
      return;
    }

    // Regenerate PIN if missing or expired; otherwise just refresh the expiry window.
    const force = (req.body as any)?.regenerate === true;
    const expired = isPinExpired(booking.startPinExpiresAt);
    const pin = (force || !booking.startPin || expired) ? generatePin() : booking.startPin;
    await db.update(bookingsTable).set({
      startPin: pin,
      startPinExpiresAt: pinExpiry(),
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, req.params.id as string));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });
    if (updated) {
      // Push fresh booking (with new PIN visible) to the customer in real time.
      broadcastBookingUpdate(updated, "booking:updated");
    }
    // NEVER include the raw PIN in the provider-facing response — sanitize hides it.
    res.json({
      booking: sanitizeBookingForViewer(updated as any, role, userId),
      pinPrepared: true,
      expiresAt: updated?.startPinExpiresAt,
    });
  } catch (e) {
    logger.error({ err: e }, "generate-start-pin error");
    res.status(500).json({ error: "Failed to prepare start PIN" });
  }
});

router.post("/:id/verify-start-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body as { pin: string };
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can verify the start PIN" });
      return;
    }
    if (booking.status !== "accepted") {
      res.status(400).json({ error: "Only accepted bookings can be started" });
      return;
    }
    if (!booking.startPin) {
      res.status(400).json({ error: "No active PIN. Tap 'Generate PIN' to ask the customer for a new code." });
      return;
    }
    if (isPinExpired(booking.startPinExpiresAt)) {
      res.status(400).json({ error: "This PIN has expired. Generate a new one." });
      return;
    }
    if (booking.startPin !== String(pin || "").trim()) {
      res.status(400).json({ error: "Incorrect PIN. Ask customer for the 4-digit code shown in their app." });
      return;
    }

    await db.update(bookingsTable).set({ status: "in_progress", jobStartedAt: new Date(), updatedAt: new Date() }).where(eq(bookingsTable.id, req.params.id as string));
    // Auto-busy: provider can't accept new requests while a job is in progress.
    await db.update(usersTable)
      .set({ isAvailable: false, updatedAt: new Date() })
      .where(eq(usersTable.id, booking.providerId));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });

    if (updated) {
      broadcastBookingUpdate(updated, "booking:started");
      // Tell the provider's app the availability flipped so the toggle re-renders.
      emitToUser(updated.providerId, "provider:availability", { isAvailable: false, reason: "in_progress" });
      notifyUser({
        userId: updated.customerId,
        title: "Job started",
        body: `${updated.providerName} started your ${updated.service} job`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      }).catch(() => undefined);
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "verify-start-pin error");
    res.status(500).json({ error: "Failed to verify start PIN" });
  }
});

router.post("/:id/generate-complete-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can generate a completion PIN" });
      return;
    }
    if (booking.status !== "in_progress") {
      res.status(400).json({ error: "Completion PIN can only be generated for in-progress bookings" });
      return;
    }

    // Always cycle a fresh PIN on regenerate; reuse a still-valid one otherwise.
    const force = (req.body as any)?.regenerate === true;
    const expired = isPinExpired(booking.completePinExpiresAt);
    const pin = (force || !booking.completePin || expired) ? generatePin() : booking.completePin;
    await db.update(bookingsTable).set({
      completePin: pin,
      completePinExpiresAt: pinExpiry(),
      updatedAt: new Date(),
    }).where(eq(bookingsTable.id, req.params.id as string));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });
    if (updated) {
      // Broadcast so the customer's screen updates with the in-app PIN immediately.
      broadcastBookingUpdate(updated, "booking:updated");
    }
    // NEVER include the raw PIN in the provider-facing response — it must come from the customer.
    res.json({
      booking: sanitizeBookingForViewer(updated as any, role, userId),
      pinPrepared: true,
      expiresAt: updated?.completePinExpiresAt,
    });
  } catch (e) {
    logger.error({ err: e }, "generate-complete-pin error");
    res.status(500).json({ error: "Failed to generate complete PIN" });
  }
});

router.post("/:id/verify-complete-pin", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { pin } = req.body as { pin: string };
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the assigned provider can verify the completion PIN" });
      return;
    }
    if (booking.status !== "in_progress") {
      res.status(400).json({ error: "Only in-progress bookings can be completed" });
      return;
    }
    if (!booking.completePin) {
      res.status(400).json({ error: "No active PIN. Tap 'Generate PIN' so the customer can read out a fresh code." });
      return;
    }
    if (isPinExpired(booking.completePinExpiresAt)) {
      res.status(400).json({ error: "This PIN has expired. Generate a new one." });
      return;
    }
    if (booking.completePin !== String(pin || "").trim()) {
      res.status(400).json({ error: "Incorrect PIN. Ask customer for the 4-digit code shown in their app." });
      return;
    }

    await db.update(bookingsTable).set({ status: "completed", updatedAt: new Date() }).where(eq(bookingsTable.id, req.params.id as string));
    // Free the provider so they can take new requests again.
    await db.update(usersTable)
      .set({ isAvailable: true, updatedAt: new Date() })
      .where(eq(usersTable.id, booking.providerId));
    const updated = await applyCompletionCommission(req.params.id as string);

    if (updated) {
      broadcastBookingUpdate(updated, "booking:completed");
      emitToUser(updated.providerId, "provider:availability", { isAvailable: true, reason: "completed" });
      notifyUser({
        userId: updated.customerId,
        title: "Job completed",
        body: `Please rate your ${updated.service} experience with ${updated.providerName}`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      }).catch(() => undefined);
    }

    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "verify-complete-pin error");
    res.status(500).json({ error: "Failed to verify complete PIN" });
  }
});

// ─── Mark as Paid (customer confirms cash handed to provider) ─────────────────
router.post("/:id/mark-paid", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.customerId !== userId) {
      res.status(403).json({ error: "Only the customer can mark payment as paid" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Only completed bookings can be marked as paid" });
      return;
    }
    await db.update(bookingsTable)
      .set({ paymentStatus: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(bookingsTable.id, req.params.id as string));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });
    if (updated) {
      notifyUser({
        userId: updated.providerId,
        title: "Payment Confirmed",
        body: `${updated.customerName} confirmed cash payment of Rs. ${updated.price || 0} for ${updated.service}.`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      }).catch(() => undefined);
      broadcastBookingUpdate(updated, "booking:updated");
    }
    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "mark-paid error");
    res.status(500).json({ error: "Failed to mark booking as paid" });
  }
});

// ─── Mark as Received (provider confirms cash received from customer) ─────────
router.post("/:id/mark-received", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.providerId !== userId) {
      res.status(403).json({ error: "Only the provider can mark payment as received" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Only completed bookings can be marked as received" });
      return;
    }
    await db.update(bookingsTable)
      .set({ paymentStatus: "received", receivedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookingsTable.id, req.params.id as string));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });
    if (updated) {
      notifyUser({
        userId: updated.customerId,
        title: "Payment Received",
        body: `${updated.providerName} confirmed receiving cash payment for ${updated.service}.`,
        type: "booking",
        link: `/bookings/${updated.id}`,
        data: { bookingId: updated.id },
      }).catch(() => undefined);
      broadcastBookingUpdate(updated, "booking:updated");
    }
    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "mark-received error");
    res.status(500).json({ error: "Failed to mark booking as received" });
  }
});

router.patch("/:id/rate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { rating, review } = req.body as { rating: number; review: string };
    const userId = req.user!.userId;
    const booking = await getBookingOr404(req.params.id as string, res);
    if (!booking) return;
    if (booking.customerId !== userId) {
      res.status(403).json({ error: "Only the customer can rate this booking" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Only completed bookings can be rated" });
      return;
    }
    if (booking.rating != null) {
      res.status(400).json({ error: "This booking has already been rated" });
      return;
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      res.status(400).json({ error: "Rating must be between 1 and 5" });
      return;
    }

    await db.update(bookingsTable).set({ rating, review, updatedAt: new Date() }).where(and(eq(bookingsTable.id, req.params.id as string), eq(bookingsTable.customerId, userId)));
    const updated = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, req.params.id as string) });
    if (updated) {
      const allBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.providerId, updated.providerId));
      const rated = allBookings.filter((b: any) => b.rating != null);
      if (rated.length > 0) {
        const avgRating = Math.round(rated.reduce((sum: any, b: any) => sum + (b.rating || 0), 0) / rated.length);
        await db.update(usersTable).set({ rating: avgRating, ratingCount: rated.length }).where(eq(usersTable.id, updated.providerId));
      }
    }
    res.json({ booking: sanitizeBookingForViewer(updated as any, req.user!.role, req.user!.userId) });
  } catch (e) {
    logger.error({ err: e }, "rate-booking error");
    res.status(500).json({ error: "Failed to rate booking" });
  }
});

export default router;

