import { Router } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import {
  appSettingsTable,
  notificationsTable,
  providerDocumentsTable,
  savedProvidersTable,
  usersTable,
} from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { toPublicProvider } from "../lib/admin";

const router = Router();
router.use(requireAuth);

const id = () => crypto.randomUUID();

// ───────── Get current user profile ─────────

router.get("/", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.id, req.user!.userId),
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const { password, ...safe } = user as any;
    return res.json({ user: safe });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// ───────── Update current user profile ─────────

router.patch("/", async (req: AuthRequest, res) => {
  try {
    const allowed = ["name", "email", "bio", "experience", "profileImage", "profileColor", "isAvailable", "services", "location"] as const;
    const update: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) {
      if ((req.body as any)[key] !== undefined) update[key] = (req.body as any)[key];
    }
    if ((req.body as any).ratePerHour !== undefined) {
      const rph = (req.body as any).ratePerHour;
      update.ratePerHour = rph === null ? null : (Number.isFinite(Number(rph)) ? Number(rph) : undefined);
    }
    if ((req.body as any).maxTravelDistanceKm !== undefined) {
      const mtd = (req.body as any).maxTravelDistanceKm;
      update.maxTravelDistanceKm = mtd === null ? null : (Number.isFinite(Number(mtd)) ? Number(mtd) : undefined);
    }
    if (Object.keys(update).length === 1) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const [updated] = await db
      .update(usersTable)
      .set(update)
      .where(eq(usersTable.id, req.user!.userId))
      .returning();
    const { password, ...safe } = updated as any;
    return res.json({ user: safe });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// ───────── Preferences (language, location) ─────────

router.patch("/preferences", async (req: AuthRequest, res) => {
  try {
    const { language, latitude, longitude } = req.body as {
      language?: string;
      latitude?: number | string | null;
      longitude?: number | string | null;
    };
    const update: Record<string, any> = { updatedAt: new Date() };
    if (language === "en" || language === "ur") update.language = language;
    if (latitude !== undefined) {
      const lat = latitude === null ? null : Number(latitude);
      if (lat === null || (Number.isFinite(lat) && lat >= -90 && lat <= 90)) update.latitude = lat;
    }
    if (longitude !== undefined) {
      const lng = longitude === null ? null : Number(longitude);
      if (lng === null || (Number.isFinite(lng) && lng >= -180 && lng <= 180)) update.longitude = lng;
    }
    if (Object.keys(update).length === 1) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const [updated] = await db
      .update(usersTable)
      .set(update)
      .where(eq(usersTable.id, req.user!.userId))
      .returning();
    const { password, ...safe } = updated as any;
    return res.json({ user: safe });
  } catch (e) {
    logger.error({ err: e }, "preferences update error");
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

// ───────── Saved providers (favorites) ─────────

router.get("/saved-providers", async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(savedProvidersTable)
      .where(eq(savedProvidersTable.userId, req.user!.userId))
      .orderBy(desc(savedProvidersTable.createdAt));

    if (rows.length === 0) return res.json({ providers: [], ids: [] });

    const providerIds = rows.map((r) => r.providerId);
    const providers = await db.query.usersTable.findMany({
      where: (u, { inArray }) => inArray(u.id, providerIds),
    });

    return res.json({
      ids: providerIds,
      providers: providers.map((p) => toPublicProvider(p)),
    });
  } catch (e) {
    logger.error({ err: e }, "saved providers list error");
    return res.status(500).json({ error: "Failed to load saved providers" });
  }
});

router.post("/saved-providers/:providerId", async (req: AuthRequest, res) => {
  try {
    const providerId = req.params.providerId;
    const exists = await db.query.savedProvidersTable.findFirst({
      where: and(
        eq(savedProvidersTable.userId, req.user!.userId),
        eq(savedProvidersTable.providerId, providerId)
      ),
    });
    if (!exists) {
      await db.insert(savedProvidersTable).values({
        id: id(),
        userId: req.user!.userId,
        providerId,
      });
    }
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "save provider error");
    return res.status(500).json({ error: "Failed to save provider" });
  }
});

router.delete("/saved-providers/:providerId", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(savedProvidersTable)
      .where(
        and(
          eq(savedProvidersTable.userId, req.user!.userId),
          eq(savedProvidersTable.providerId, req.params.providerId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to remove saved provider" });
  }
});

// ───────── Provider documents (own) ─────────

router.get("/documents", async (req: AuthRequest, res) => {
  try {
    const docs = await db
      .select()
      .from(providerDocumentsTable)
      .where(eq(providerDocumentsTable.providerId, req.user!.userId))
      .orderBy(desc(providerDocumentsTable.createdAt));
    return res.json({ documents: docs });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load documents" });
  }
});

router.post("/documents", async (req: AuthRequest, res) => {
  try {
    const { type, label, url } = req.body as {
      type?: string;
      label?: string;
      url?: string;
    };
    if (!type?.trim() || !url?.trim()) {
      return res.status(400).json({ error: "type and url are required" });
    }
    const doc = {
      id: id(),
      providerId: req.user!.userId,
      type: type.trim(),
      label: label?.trim() || null,
      url: url.trim(),
      status: "pending" as const,
    };
    await db.insert(providerDocumentsTable).values(doc);

    // Move provider into in_process so admin sees them in queue.
    await db
      .update(usersTable)
      .set({ verificationStatus: "in_process", updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));

    return res.json({ document: doc });
  } catch (e) {
    logger.error({ err: e }, "upload document error");
    return res.status(500).json({ error: "Failed to save document" });
  }
});

router.delete("/documents/:docId", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(providerDocumentsTable)
      .where(
        and(
          eq(providerDocumentsTable.id, req.params.docId),
          eq(providerDocumentsTable.providerId, req.user!.userId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete document" });
  }
});

// ───────── In-app notifications ─────────

router.get("/notifications", async (req: AuthRequest, res) => {
  try {
    const items = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(100);
    const unread = items.filter((n) => !n.isRead).length;
    return res.json({ notifications: items, unread });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/notifications/read-all", async (req: AuthRequest, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, req.user!.userId));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to mark notifications" });
  }
});

router.patch("/notifications/:notifId/read", async (req: AuthRequest, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.id, req.params.notifId),
          eq(notificationsTable.userId, req.user!.userId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update notification" });
  }
});

router.delete("/notifications/:notifId", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, req.params.notifId),
          eq(notificationsTable.userId, req.user!.userId)
        )
      );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete notification" });
  }
});

router.delete("/notifications", async (req: AuthRequest, res) => {
  try {
    await db
      .delete(notificationsTable)
      .where(eq(notificationsTable.userId, req.user!.userId));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to clear notifications" });
  }
});

// ───────── Availability schedule ─────────

const SCHEDULE_KEY_PREFIX = "schedule:";

type DaySchedule = { enabled: boolean; startTime: string; endTime: string };
type WeeklySchedule = { mon: DaySchedule; tue: DaySchedule; wed: DaySchedule; thu: DaySchedule; fri: DaySchedule; sat: DaySchedule; sun: DaySchedule };

const DEFAULT_SCHEDULE: WeeklySchedule = {
  mon: { enabled: true, startTime: "09:00", endTime: "18:00" },
  tue: { enabled: true, startTime: "09:00", endTime: "18:00" },
  wed: { enabled: true, startTime: "09:00", endTime: "18:00" },
  thu: { enabled: true, startTime: "09:00", endTime: "18:00" },
  fri: { enabled: true, startTime: "09:00", endTime: "18:00" },
  sat: { enabled: true, startTime: "09:00", endTime: "17:00" },
  sun: { enabled: false, startTime: "10:00", endTime: "16:00" },
};

router.get("/schedule", async (req: AuthRequest, res) => {
  try {
    const key = `${SCHEDULE_KEY_PREFIX}${req.user!.userId}`;
    const row = await db.query.appSettingsTable.findFirst({ where: eq(appSettingsTable.key, key) });
    const schedule = (row?.value as WeeklySchedule) || DEFAULT_SCHEDULE;
    return res.json({ schedule });
  } catch (e) {
    logger.error({ err: e }, "get schedule error");
    return res.status(500).json({ error: "Failed to load schedule" });
  }
});

router.patch("/schedule", async (req: AuthRequest, res) => {
  try {
    const key = `${SCHEDULE_KEY_PREFIX}${req.user!.userId}`;
    const incoming = req.body as Partial<WeeklySchedule>;
    const current = await db.query.appSettingsTable.findFirst({ where: eq(appSettingsTable.key, key) });
    const base = (current?.value as WeeklySchedule) || DEFAULT_SCHEDULE;
    const next: WeeklySchedule = { ...base };
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    for (const day of days) {
      if (incoming[day]) {
        next[day] = {
          enabled: Boolean(incoming[day]!.enabled),
          startTime: String(incoming[day]!.startTime || base[day].startTime),
          endTime: String(incoming[day]!.endTime || base[day].endTime),
        };
      }
    }
    await db.insert(appSettingsTable).values({ key, value: next, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: next, updatedAt: new Date() } });
    return res.json({ schedule: next });
  } catch (e) {
    logger.error({ err: e }, "update schedule error");
    return res.status(500).json({ error: "Failed to update schedule" });
  }
});

export default router;

