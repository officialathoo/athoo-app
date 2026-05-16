import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import {
  broadcastRequestsTable,
  broadcastResponsesTable,
  bookingsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, ne, desc, sql, or } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { getPlatformSettings } from "../lib/admin";
import { emitToUser, emitToRole, type EventName } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";

const router = Router();

function generateId(): string {
  return crypto.randomUUID();
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function toDecimal(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Broadcast hard expiry: 3 minutes total
const BROADCAST_TTL_MS = 3 * 60 * 1000;
// After 1 minute with no acceptance, visibility expands to wider radius
const BROADCAST_EXPAND_MS = 1 * 60 * 1000;
function broadcastExpiry(): Date {
  return new Date(Date.now() + BROADCAST_TTL_MS);
}

function isExpiredBroadcast(r: { status: string; expiresAt: Date }): boolean {
  if (r.status !== "open") return false;
  return new Date(r.expiresAt).getTime() <= Date.now();
}

// Calculate distance in km between two lat/lng pairs (Haversine)
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Customer: Create broadcast request ──────────────────────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can create broadcast requests" });
      return;
    }

    const customer = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }

    const {
      service,
      serviceLabel,
      serviceIcon,
      description,
      videoUrl,
      address,
      latitude,
      longitude,
      scheduledDate,
      scheduledTime,
      customerOffer,
      customerRatePerHour,
      customerHours,
      customerTravelCharge,
    } = req.body;

    if (!service || !serviceLabel || !address || !scheduledDate || !scheduledTime) {
      res.status(400).json({
        error: "service, serviceLabel, address, scheduledDate, and scheduledTime are required",
      });
      return;
    }

    const parsedLat = toDecimal(latitude);
    const parsedLng = toDecimal(longitude);
    const parsedOffer = toNumber(customerOffer);
    // Accept both customerRatePerHour and ratePerHour as field names for flexibility
    const parsedCustRatePerHour = toNumber(customerRatePerHour) ?? toNumber(req.body.ratePerHour);
    const parsedCustHours = toDecimal(customerHours) ?? toDecimal(req.body.hours);
    const parsedCustTravelCharge = toNumber(customerTravelCharge) ?? toNumber(req.body.travelCharge);

    // Require customer GPS coordinates server-side — frontend location gate is not sufficient
    if (parsedLat === null || parsedLng === null) {
      res.status(400).json({ error: "Your location is required to create a broadcast request. Please enable location access in your app settings." });
      return;
    }

    const request = {
      id: generateId(),
      customerId: userId,
      customerName: customer.name,
      service: String(service).trim(),
      serviceLabel: String(serviceLabel).trim(),
      serviceIcon: serviceIcon || "tool",
      description: description || null,
      videoUrl: videoUrl || null,
      address: String(address).trim(),
      latitude: parsedLat,
      longitude: parsedLng,
      scheduledDate: String(scheduledDate),
      scheduledTime: String(scheduledTime),
      customerOffer: parsedOffer,
      customerRatePerHour: parsedCustRatePerHour,
      customerHours: parsedCustHours,
      customerTravelCharge: parsedCustTravelCharge,
      status: "open",
      acceptedResponseId: null,
      bookingId: null,
      expiresAt: broadcastExpiry(),
    };

    await db.insert(broadcastRequestsTable).values(request);

    // Notify all available providers in this category (or all if no lat/lng)
    const allProviders = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "provider"),
          eq(usersTable.isAvailable, true),
          eq(usersTable.isBlocked, false),
          eq(usersTable.isDeactivated, false),
          eq(usersTable.verificationStatus, "approved")
        )
      );

    const serviceKey = String(service).toLowerCase();
    const MAX_RADIUS_KM = 30;

    const nearbyProviders = allProviders.filter((p) => {
      const hasService =
        !p.services ||
        p.services.length === 0 ||
        p.services.some(
          (s) => s && s.toLowerCase().includes(serviceKey)
        );

      if (!hasService) return false;

      if (parsedLat != null && parsedLng != null) {
        const pLat = parseFloat(p.latitude || "");
        const pLng = parseFloat(p.longitude || "");
        if (!isNaN(pLat) && !isNaN(pLng)) {
          return distanceKm(parsedLat, parsedLng, pLat, pLng) <= MAX_RADIUS_KM;
        }
      }

      return true;
    });

    const priceText = parsedOffer ? `Rs. ${parsedOffer}` : "open price";
    for (const provider of nearbyProviders) {
      emitToUser(provider.id, "broadcast:new" as EventName, { request });
      notifyUser({
        userId: provider.id,
        title: "New Job Request",
        body: `${customer.name} needs ${serviceLabel} — ${priceText}`,
        type: "broadcast",
        link: `/broadcast/${request.id}`,
        data: { broadcastRequestId: request.id },
      }).catch(() => undefined);
    }

    emitToRole("admin", "admin:event" as EventName, { type: "broadcast:new", request });

    res.json({ request });
  } catch (e) {
    logger.error({ err: e }, "broadcast create error");
    res.status(500).json({ error: "Failed to create broadcast request" });
  }
});

// ─── Customer: List my broadcast requests ────────────────────────────────────
// ─── Provider: List open broadcasts in their service area ────────────────────
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    if (role === "customer") {
      const rows = await db
        .select()
        .from(broadcastRequestsTable)
        .where(eq(broadcastRequestsTable.customerId, userId))
        .orderBy(desc(broadcastRequestsTable.createdAt));

      // Attach responses count for each
      const withResponses = await Promise.all(
        rows.map(async (r) => {
          const responses = await db
            .select()
            .from(broadcastResponsesTable)
            .where(eq(broadcastResponsesTable.requestId, r.id));
          return { ...r, responses };
        })
      );

      res.json({ requests: withResponses });
      return;
    }

    if (role === "provider") {
      const provider = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, userId),
      });
      if (!provider) {
        res.status(404).json({ error: "Provider not found" });
        return;
      }

      // Get all open, non-expired broadcasts
      const rows = await db
        .select()
        .from(broadcastRequestsTable)
        .where(eq(broadcastRequestsTable.status, "open"))
        .orderBy(desc(broadcastRequestsTable.createdAt));

      const serviceKey = (provider.services || [])
        .map((s) => s.toLowerCase())
        .join(",");

      const pLat = parseFloat(provider.latitude || "");
      const pLng = parseFloat(provider.longitude || "");
      const MAX_RADIUS_KM = 30;
      const now = Date.now();

      const filtered = rows.filter((r) => {
        if (new Date(r.expiresAt).getTime() <= now) return false;

        const matches =
          !serviceKey ||
          serviceKey.includes(r.service.toLowerCase()) ||
          r.service.toLowerCase().includes("general");

        if (!matches) return false;

        if (!isNaN(pLat) && !isNaN(pLng) && r.latitude != null && r.longitude != null) {
          // Progressive radius: 30km for first 5 min, expands to 50km after that
          const createdMs = r.createdAt ? new Date(r.createdAt).getTime() : now;
          const broadcastAgeMs = now - createdMs;
          const effectiveRadius = broadcastAgeMs >= BROADCAST_EXPAND_MS ? 50 : MAX_RADIUS_KM;
          return distanceKm(pLat, pLng, r.latitude, r.longitude) <= effectiveRadius;
        }

        return true;
      });

      // Attach provider's own response if it exists, and enrich with customer details
      const enriched = await Promise.all(
        filtered.map(async (r) => {
          const myResponse = await db.query.broadcastResponsesTable.findFirst({
            where: and(
              eq(broadcastResponsesTable.requestId, r.id),
              eq(broadcastResponsesTable.providerId, userId)
            ),
          });

          const customer = await db.query.usersTable.findFirst({
            where: eq(usersTable.id, r.customerId),
          });

          const totalResponses = await db
            .select({ count: sql<number>`count(*)` })
            .from(broadcastResponsesTable)
            .where(eq(broadcastResponsesTable.requestId, r.id));

          const distKm =
            !isNaN(pLat) && !isNaN(pLng) && r.latitude != null && r.longitude != null
              ? Math.round(distanceKm(pLat, pLng, r.latitude, r.longitude) * 10) / 10
              : null;

          return {
            ...r,
            myResponse: myResponse || null,
            customerRating: customer?.rating || 0,
            responseCount: Number(totalResponses[0]?.count || 0),
            distanceKm: distKm,
          };
        })
      );

      res.json({ requests: enriched });
      return;
    }

    if (role === "admin") {
      const rows = await db
        .select()
        .from(broadcastRequestsTable)
        .orderBy(desc(broadcastRequestsTable.createdAt));

      const withDetails = await Promise.all(
        rows.map(async (r) => {
          const responses = await db
            .select()
            .from(broadcastResponsesTable)
            .where(eq(broadcastResponsesTable.requestId, r.id));
          const customer = await db.query.usersTable.findFirst({
            where: eq(usersTable.id, r.customerId),
          });
          return { ...r, responses, customerName: customer?.name ?? null };
        })
      );

      res.json({ requests: withDetails });
      return;
    }

    res.status(403).json({ error: "Unauthorized" });
  } catch (e) {
    logger.error({ err: e }, "broadcast list error");
    res.status(500).json({ error: "Failed to load broadcast requests" });
  }
});

// ─── Get single broadcast request (with responses) ───────────────────────────
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (role === "customer" && request.customerId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const responses = await db
      .select()
      .from(broadcastResponsesTable)
      .where(eq(broadcastResponsesTable.requestId, request.id))
      .orderBy(broadcastResponsesTable.createdAt);

    const enrichedResponses = await Promise.all(
      responses.map(async (resp) => {
        const provider = await db.query.usersTable.findFirst({
          where: eq(usersTable.id, resp.providerId),
        });
        return {
          ...resp,
          providerRating: provider?.rating || 0,
          providerTotalJobs: provider?.totalJobs || 0,
          providerIsVerified: provider?.isVerified || false,
          providerProfileImage: provider?.profileImage || null,
          providerProfileColor: provider?.profileColor || "#1A6EE0",
        };
      })
    );

    res.json({ request: { ...request, responses: enrichedResponses } });
  } catch (e) {
    logger.error({ err: e }, "broadcast get error");
    res.status(500).json({ error: "Failed to load broadcast request" });
  }
});

// ─── Provider: Respond to a broadcast (accept price or counter) ──────────────
router.post("/:id/respond", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Only providers can respond to broadcasts" });
      return;
    }

    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (request.status !== "open") {
      res.status(400).json({ error: "This broadcast request is no longer open" });
      return;
    }

    if (isExpiredBroadcast(request as any)) {
      res.status(400).json({ error: "This broadcast request has expired" });
      return;
    }

    if (request.customerId === userId) {
      res.status(400).json({ error: "You cannot respond to your own request" });
      return;
    }

    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!provider || provider.isBlocked || provider.isDeactivated) {
      res.status(400).json({ error: provider?.blockedReason || "Your account cannot respond right now" });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(403).json({ error: "Only verified providers can respond to broadcast requests." });
      return;
    }

    // Check for existing response
    const existing = await db.query.broadcastResponsesTable.findFirst({
      where: and(
        eq(broadcastResponsesTable.requestId, request.id),
        eq(broadcastResponsesTable.providerId, userId)
      ),
    });

    if (existing) {
      res.status(409).json({ error: "You have already responded to this request", response: existing });
      return;
    }

    const body = req.body;
    // Accept both prefixed (providerRatePerHour) and unprefixed (ratePerHour) field names
    const parsedOffer = toNumber(body.providerOffer ?? body.offer);
    const parsedRatePerHour = toNumber(body.providerRatePerHour ?? body.ratePerHour);
    const parsedHours = toDecimal(body.providerHours ?? body.hours);
    const parsedTravelCharge = toNumber(body.providerTravelCharge ?? body.travelCharge);
    const message = body.message;
    // If provider explicitly accepts customer's price (no counter).
    // Respect explicit isDirectAccept=false from the client when counter terms are sent.
    const isDirectAccept = body.acceptCustomerPrice === true
      || body.isDirectAccept === true
      || (body.isDirectAccept !== false && parsedOffer == null && parsedRatePerHour == null);

    const response = {
      id: generateId(),
      requestId: request.id,
      providerId: userId,
      providerName: provider.name,
      providerOffer: parsedOffer,
      providerRatePerHour: parsedRatePerHour,
      providerHours: parsedHours,
      providerTravelCharge: parsedTravelCharge,
      isDirectAccept,
      message: message || null,
      status: "pending",
    };

    await db.insert(broadcastResponsesTable).values(response);

    const finalPrice = parsedOffer ?? request.customerOffer;
    const priceText = finalPrice ? `Rs. ${finalPrice}` : "open price";

    emitToUser(request.customerId, "broadcast:response" as EventName, {
      requestId: request.id,
      response: {
        ...response,
        providerRating: provider.rating || 0,
        providerTotalJobs: provider.totalJobs || 0,
        providerIsVerified: provider.isVerified || false,
      },
    });

    notifyUser({
      userId: request.customerId,
      title: "Provider responded!",
      body: `${provider.name} responded to your ${request.serviceLabel} request — ${priceText}`,
      type: "broadcast",
      link: `/broadcast/${request.id}`,
      data: { broadcastRequestId: request.id },
    }).catch(() => undefined);

    res.json({ response });
  } catch (e) {
    logger.error({ err: e }, "broadcast respond error");
    res.status(500).json({ error: "Failed to respond to broadcast request" });
  }
});

// ─── Customer: Select a provider response → creates a booking ────────────────
router.post("/:id/select/:responseId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can select a provider" });
      return;
    }

    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (request.customerId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (request.status !== "open") {
      res.status(400).json({ error: "This broadcast request is no longer open" });
      return;
    }

    const chosenResponse = await db.query.broadcastResponsesTable.findFirst({
      where: and(
        eq(broadcastResponsesTable.id, String(req.params.responseId)),
        eq(broadcastResponsesTable.requestId, request.id)
      ),
    });

    if (!chosenResponse) {
      res.status(404).json({ error: "Provider response not found" });
      return;
    }

    if (chosenResponse.status !== "pending") {
      res.status(400).json({ error: "This provider response is no longer available" });
      return;
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, chosenResponse.providerId),
    });

    if (!provider || provider.isBlocked || provider.isDeactivated || !provider.isAvailable) {
      res.status(400).json({ error: "This provider is not available right now" });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(400).json({ error: "This provider has not completed verification and cannot be booked." });
      return;
    }

    const customer = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!customer) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }

    // Determine final agreed terms based on provider's response:
    // If provider directly accepted customer's price (isDirectAccept or no providerOffer),
    //   use customer's terms → booking confirmed immediately (no extra accept needed)
    // If provider sent a counter offer (providerOffer set),
    //   customer is selecting/accepting that offer → booking confirmed immediately
    //   (provider already proposed these terms, no need for provider to accept again)
    const isDirectAccept = chosenResponse.isDirectAccept || chosenResponse.providerOffer == null;

    // Final pricing: use provider's counter terms if they exist, otherwise customer's original terms
    const finalRatePerHour = chosenResponse.providerRatePerHour ?? request.customerRatePerHour ?? null;
    const finalHours = chosenResponse.providerHours ?? request.customerHours ?? null;
    const finalTravelCharge = chosenResponse.providerTravelCharge ?? request.customerTravelCharge ?? null;
    const agreedPrice = chosenResponse.providerOffer ?? request.customerOffer;

    // Compute total from detailed fields if available, otherwise use flat price
    const serviceCharge = (finalRatePerHour && finalHours)
      ? Math.round(finalRatePerHour * finalHours)
      : (agreedPrice || 0);
    const travelChargeVal = finalTravelCharge ?? 0;
    const totalPrice = serviceCharge + travelChargeVal;

    // CONFIRMED directly — both parties have agreed:
    // - If provider accepted customer's price → customer's terms accepted, confirmed
    // - If customer selects provider's counter → provider's terms accepted, confirmed
    // No extra acceptance step needed from either side.
    const booking = {
      id: generateId(),
      customerId: userId,
      customerName: customer.name,
      customerPhone: customer.phone,
      providerId: provider.id,
      providerName: provider.name,
      providerPhone: provider.phone,
      service: request.serviceLabel,
      serviceIcon: request.serviceIcon || "tool",
      description: request.description || null,
      attachment: request.videoUrl || null,
      address: request.address,
      scheduledDate: request.scheduledDate,
      scheduledTime: request.scheduledTime,
      status: "confirmed",
      price: totalPrice,
      ratePerHour: finalRatePerHour,
      hours: finalHours,
      travelCharge: travelChargeVal,
      source: "broadcast",
      broadcastRequestId: request.id,
      broadcastResponseId: chosenResponse.id,
      commissionAmount: 0,
      providerAmount: totalPrice,
      commissionRate: 0,
      visitCharge: travelChargeVal,
      pickedLat: request.latitude,
      pickedLng: request.longitude,
      customerLat: request.latitude,
      customerLng: request.longitude,
      providerLat: null,
      providerLng: null,
      providerAccuracy: null,
      providerUpdatedAt: null,
      providerArrivedAt: null,
    };

    await db.insert(bookingsTable).values(booking);

    // Mark broadcast as accepted
    await db
      .update(broadcastRequestsTable)
      .set({
        status: "accepted",
        acceptedResponseId: chosenResponse.id,
        bookingId: booking.id,
        updatedAt: new Date(),
      })
      .where(eq(broadcastRequestsTable.id, request.id));

    // Mark chosen response as accepted
    await db
      .update(broadcastResponsesTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(broadcastResponsesTable.id, chosenResponse.id));

    // Mark all other pending responses as "not_selected" and notify those providers
    const otherResponses = await db
      .select()
      .from(broadcastResponsesTable)
      .where(
        and(
          eq(broadcastResponsesTable.requestId, request.id),
          ne(broadcastResponsesTable.id, chosenResponse.id),
          eq(broadcastResponsesTable.status, "pending")
        )
      );

    if (otherResponses.length > 0) {
      await db
        .update(broadcastResponsesTable)
        .set({ status: "not_selected", updatedAt: new Date() })
        .where(
          and(
            eq(broadcastResponsesTable.requestId, request.id),
            ne(broadcastResponsesTable.id, chosenResponse.id),
            eq(broadcastResponsesTable.status, "pending")
          )
        );

      // Notify each rejected provider that the job was assigned to someone else
      for (const resp of otherResponses) {
        emitToUser(resp.providerId, "broadcast:not_selected" as EventName, {
          requestId: request.id,
          responseId: resp.id,
        });
        notifyUser({
          userId: resp.providerId,
          title: "Job assigned to another provider",
          body: `The ${request.serviceLabel} job has been assigned to another provider.`,
          type: "broadcast",
          link: `/broadcast/${request.id}`,
          data: { broadcastRequestId: request.id },
        }).catch(() => undefined);
      }
    }

    // Notify chosen provider — booking is CONFIRMED, no extra accept needed
    emitToUser(provider.id, "booking:new" as EventName, { booking });
    notifyUser({
      userId: provider.id,
      title: "Booking confirmed!",
      body: `${customer.name} confirmed you for ${request.serviceLabel} — Rs. ${totalPrice}`,
      type: "booking",
      link: `/jobs/${booking.id}`,
      data: { bookingId: booking.id },
    }).catch(() => undefined);

    // Notify customer
    emitToUser(userId, "booking:updated" as EventName, { booking });

    emitToRole("admin", "admin:event" as EventName, { type: "booking:new", booking });

    res.json({ booking, request: { ...request, status: "accepted", bookingId: booking.id } });
  } catch (e) {
    logger.error({ err: e }, "broadcast select error");
    res.status(500).json({ error: "Failed to select provider and create booking" });
  }
});

// ─── Customer: Cancel broadcast request ──────────────────────────────────────
router.post("/:id/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const request = await db.query.broadcastRequestsTable.findFirst({
      where: eq(broadcastRequestsTable.id, String(req.params.id)),
    });

    if (!request) {
      res.status(404).json({ error: "Broadcast request not found" });
      return;
    }

    if (request.customerId !== userId && req.user!.role !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (request.status !== "open") {
      res.status(400).json({ error: "Only open requests can be cancelled" });
      return;
    }

    await db
      .update(broadcastRequestsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(broadcastRequestsTable.id, request.id));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "broadcast cancel error");
    res.status(500).json({ error: "Failed to cancel broadcast request" });
  }
});

// ─── Provider: Withdraw their response ───────────────────────────────────────
router.post("/:id/respond/withdraw", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Only providers can withdraw responses" });
      return;
    }

    const existing = await db.query.broadcastResponsesTable.findFirst({
      where: and(
        eq(broadcastResponsesTable.requestId, String(req.params.id)),
        eq(broadcastResponsesTable.providerId, userId)
      ),
    });

    if (!existing) {
      res.status(404).json({ error: "Response not found" });
      return;
    }

    if (existing.status !== "pending") {
      res.status(400).json({ error: "Can only withdraw pending responses" });
      return;
    }

    await db
      .update(broadcastResponsesTable)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(eq(broadcastResponsesTable.id, existing.id));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "broadcast withdraw error");
    res.status(500).json({ error: "Failed to withdraw response" });
  }
});

export default router;
