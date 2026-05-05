import { Router } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { usersTable, bookingsTable, serviceCategoriesTable } from "@workspace/db/schema";
import { eq, and, or, arrayContains, isNotNull, isNull, desc, gt, lt, ne, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { toPublicProvider, toSafeUser } from "../lib/admin";

const router = Router();

// Public platform stats for home screen
router.get("/stats", async (_req, res) => {
  try {
    const [providerCount, categoryCount, ratingRows] = await Promise.all([
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.isDeactivated, false))),
      db.$count(serviceCategoriesTable, eq(serviceCategoriesTable.isActive, true)),
      db.select({ avg: sql<number>`round(coalesce(avg(${usersTable.rating}::numeric), 4.8), 1)` })
        .from(usersTable)
        .where(and(eq(usersTable.role, "provider"), isNotNull(usersTable.rating), gt(usersTable.rating, 0))),
    ]);
    const avgRating = ratingRows[0]?.avg ?? 4.8;
    return res.json({ providerCount: providerCount || 50, categoryCount: categoryCount || 12, avgRating });
  } catch (e) {
    logger.error({ err: e }, "providers stats error");
    return res.status(500).json({ providerCount: 50, categoryCount: 12, avgRating: 4.8 });
  }
});

// Haversine distance (km) — straight-line, accurate enough for matching.
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Nearest available providers — Haversine sort, 100% free, no Google Maps.
// Skips blocked / unavailable / cooldown providers automatically.
router.get("/nearest", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const serviceId = req.query.serviceId ? String(req.query.serviceId) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "lat and lng query params are required" });
      return;
    }
    const now = new Date();
    const rows = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "provider"),
          eq(usersTable.isDeactivated, false),
          eq(usersTable.isBlocked, false),
          eq(usersTable.isAvailable, true),
          eq(usersTable.verificationStatus, "approved"),
          or(isNull(usersTable.cooldownUntil), lt(usersTable.cooldownUntil, now)),
          serviceId ? arrayContains(usersTable.services, [serviceId]) : isNotNull(usersTable.id),
        )
      );
    const ranked = rows
      .map((p) => {
        const pl = Number(p.latitude);
        const pn = Number(p.longitude);
        const km = Number.isFinite(pl) && Number.isFinite(pn) ? distanceKm(lat, lng, pl, pn) : null;
        return { ...toPublicProvider(p), distanceKm: km };
      })
      // Providers without coordinates fall to the bottom but stay listed.
      .sort((a, b) => {
        const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return (b.rating || 0) - (a.rating || 0);
      })
      .slice(0, limit);
    res.json({ providers: ranked });
  } catch (e) {
    logger.error({ err: e }, "nearest providers error");
    res.status(500).json({ error: "Failed to load nearest providers" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { serviceId } = req.query as { serviceId?: string };
    const providers = await db
      .select()
      .from(usersTable)
      .where(
        serviceId
          ? and(
              eq(usersTable.role, "provider"),
              eq(usersTable.isDeactivated, false),
              eq(usersTable.isBlocked, false),
              eq(usersTable.verificationStatus, "approved"),
              arrayContains(usersTable.services, [serviceId])
            )
          : and(
              eq(usersTable.role, "provider"),
              eq(usersTable.isDeactivated, false),
              eq(usersTable.isBlocked, false),
              eq(usersTable.verificationStatus, "approved")
            )
      );

    res.json({ providers: providers.map((provider) => toPublicProvider(provider)) });
  } catch (e) {
    logger.error({ err: e }, "providers list error");
    res.status(500).json({ error: "Failed to load providers" });
  }
});

router.get("/availability", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: toSafeUser(user) });
  } catch {
    res.status(500).json({ error: "Failed to load availability" });
  }
});

router.patch("/availability", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { isAvailable } = req.body as { isAvailable: boolean };
    if (typeof isAvailable !== "boolean") {
      res.status(400).json({ error: "isAvailable must be a boolean" });
      return;
    }

    const me = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!me) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (me.isBlocked && isAvailable) {
      res.status(400).json({ error: me.blockedReason || "Your account is blocked from receiving new jobs until dues are cleared." });
      return;
    }

    await db
      .update(usersTable)
      .set({ isAvailable, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    res.json({ user: toSafeUser(user) });
  } catch (e) {
    res.status(500).json({ error: "Failed to update availability" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const provider = await db.query.usersTable.findFirst({
      where: and(eq(usersTable.id, req.params.id), eq(usersTable.role, "provider")),
    });
    if (!provider) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    res.json({ provider: toPublicProvider(provider) });
  } catch (e) {
    res.status(500).json({ error: "Failed to load provider" });
  }
});

router.get("/:id/reviews", async (req, res) => {
  try {
    const reviews = await db
      .select({
        id: bookingsTable.id,
        rating: bookingsTable.rating,
        review: bookingsTable.review,
        customerName: bookingsTable.customerName,
        service: bookingsTable.service,
        createdAt: bookingsTable.updatedAt,
      })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.providerId, req.params.id),
          eq(bookingsTable.status, "completed"),
          isNotNull(bookingsTable.rating)
        )
      )
      .orderBy(desc(bookingsTable.updatedAt))
      .limit(30);
    res.json({ reviews });
  } catch (e) {
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

export default router;

export const ratingsRouter = Router();

ratingsRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { bookingId, rating, review } = req.body as { bookingId: string; rating: number; review?: string };
    if (!bookingId || typeof rating !== "number" || rating < 1 || rating > 5) {
      res.status(400).json({ error: "bookingId and rating (1-5) are required" });
      return;
    }
    await db
      .update(bookingsTable)
      .set({ rating, review: review || null, updatedAt: new Date() })
      .where(eq(bookingsTable.id, bookingId));

    const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
    if (booking) {
      const allRated = await db
        .select({ rating: bookingsTable.rating })
        .from(bookingsTable)
        .where(and(eq(bookingsTable.providerId, booking.providerId), isNotNull(bookingsTable.rating)));
      if (allRated.length > 0) {
        const avgRating = Math.round(
          allRated.reduce((sum: any, b: any) => sum + (b.rating || 0), 0) / allRated.length
        );
        await db
          .update(usersTable)
          .set({ rating: avgRating, ratingCount: allRated.length })
          .where(eq(usersTable.id, booking.providerId));
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

ratingsRouter.get("/provider/:providerId", async (req, res) => {
  try {
    const reviews = await db
      .select({
        id: bookingsTable.id,
        rating: bookingsTable.rating,
        review: bookingsTable.review,
        customerName: bookingsTable.customerName,
        service: bookingsTable.service,
        createdAt: bookingsTable.updatedAt,
      })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.providerId, req.params.providerId),
          eq(bookingsTable.status, "completed"),
          isNotNull(bookingsTable.rating)
        )
      )
      .orderBy(desc(bookingsTable.updatedAt))
      .limit(50);

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.providerId),
      columns: { rating: true, ratingCount: true },
    });

    res.json({
      reviews,
      averageRating: provider?.rating ?? 0,
      reviewCount: provider?.ratingCount ?? 0,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to load ratings" });
  }
});

