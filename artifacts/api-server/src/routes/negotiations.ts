import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router } from "express";
import { db } from "@workspace/db";
import { negotiationsTable, usersTable, bookingsTable } from "@workspace/db/schema";
import { and, eq, or } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import type { NegotiationMessage } from "@workspace/db/schema";
import { Response } from "express";
import { emitToUser, emitToRole, type EventName } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";
import { getPlatformSettings } from "../lib/admin";

const router = Router();

type NegotiationStatus =
  | "customer_offer"
  | "provider_counter"
  | "accepted"
  | "rejected";

function generateId(): string {
  return crypto.randomUUID();
}

function toAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function isClosed(status: string) {
  return status === "accepted" || status === "rejected";
}

// 20-second auto-expire window — matches the customer/provider live timer.
const NEGOTIATION_TTL_MS = 20_000;
function nextDeadline(): Date {
  return new Date(Date.now() + NEGOTIATION_TTL_MS);
}
function isExpired(neg: { status: string; expiresAt: Date | null }): boolean {
  if (isClosed(neg.status)) return false;
  return !!neg.expiresAt && neg.expiresAt.getTime() <= Date.now();
}

// If a negotiation deadline has passed, lazily mark it rejected and
// fan out a `negotiation:expired` event so live UIs can hide the timer.
async function expireIfStale<T extends { id: string; status: string; expiresAt: Date | null; customerId: string; providerId: string; messages: unknown }>(
  neg: T
): Promise<T> {
  if (!isExpired(neg)) return neg;
  const msgs = Array.isArray(neg.messages) ? [...(neg.messages as NegotiationMessage[])] : [];
  msgs.push({
    id: generateId(),
    senderId: "system",
    senderName: "System",
    text: "Offer expired (no response in time)",
    timestamp: new Date().toISOString(),
  });
  await db
    .update(negotiationsTable)
    .set({ status: "rejected", messages: msgs, updatedAt: new Date() })
    .where(eq(negotiationsTable.id, neg.id));
  const updated = { ...neg, status: "rejected", messages: msgs };
  emitToUser(neg.customerId, "negotiation:expired", { negotiation: updated });
  emitToUser(neg.providerId, "negotiation:expired", { negotiation: updated });
  return updated;
}

async function getNegotiationOr404(id: string, res: Response) {
  const negotiation = await db.query.negotiationsTable.findFirst({
    where: eq(negotiationsTable.id, id),
  });

  if (!negotiation) {
    res.status(404).json({ error: "Negotiation not found" });
    return null;
  }

  return await expireIfStale(negotiation);
}

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select()
      .from(negotiationsTable)
      .where(
        or(
          eq(negotiationsTable.customerId, userId),
          eq(negotiationsTable.providerId, userId)
        )
      )
      .orderBy(negotiationsTable.createdAt);
    // Lazy-expire any stale offers so callers always see the true state.
    const negotiations = await Promise.all(rows.map((n) => expireIfStale(n)));
    res.json({ negotiations: negotiations.reverse() });
  } catch (e) {
    logger.error({ err: e }, "negotiations list error");
    res.status(500).json({ error: "Failed to load negotiations" });
  }
});

router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;
    const userId = req.user!.userId;
    if (neg.customerId !== userId && neg.providerId !== userId) {
      res.status(403).json({ error: "You can only view your own negotiations" });
      return;
    }
    res.json({ negotiation: neg });
  } catch (e) {
    logger.error({ err: e }, "negotiation get error");
    res.status(500).json({ error: "Failed to load negotiation" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    if (role !== "customer") {
      res.status(403).json({ error: "Only customers can start negotiations" });
      return;
    }

    const { providerId, providerName, customerName, service, customerOffer } = req.body;
    const amount = toAmount(customerOffer);
    if (!providerId || !service || !amount || amount < 100) {
      res.status(400).json({ error: "Valid provider, service, and offer are required" });
      return;
    }

    if (providerId === userId) {
      res.status(400).json({ error: "You cannot negotiate with yourself" });
      return;
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, String(providerId)),
    });

    if (!provider || provider.role !== "provider") {
      res.status(400).json({ error: "Selected user is not a valid provider" });
      return;
    }
    if (provider.isDeactivated || provider.isBlocked) {
      res.status(400).json({ error: provider.blockedReason || "This provider is not available for negotiation right now." });
      return;
    }
    if (provider.verificationStatus !== "approved") {
      res.status(400).json({ error: "This provider has not been verified yet." });
      return;
    }
    if (!provider.isAvailable) {
      res.status(400).json({ error: "This provider is currently busy and cannot take new offers." });
      return;
    }

    const activeExisting = await db.query.negotiationsTable.findFirst({
      where: and(
        eq(negotiationsTable.customerId, userId),
        eq(negotiationsTable.providerId, String(providerId)),
        eq(negotiationsTable.service, String(service)),
        or(
          eq(negotiationsTable.status, "customer_offer" as NegotiationStatus),
          eq(negotiationsTable.status, "provider_counter" as NegotiationStatus)
        )
      ),
    });

    if (activeExisting) {
      res.status(409).json({
        error: "An active negotiation already exists for this provider and service",
        negotiation: activeExisting,
      });
      return;
    }

    const firstMsg: NegotiationMessage = {
      id: generateId(),
      senderId: userId,
      senderName: customerName || "Customer",
      text: `Customer offered Rs. ${amount}`,
      offerAmount: amount,
      timestamp: new Date().toISOString(),
    };

    const negotiation = {
      id: generateId(),
      customerId: userId,
      customerName: customerName || "Customer",
      providerId: String(providerId),
      providerName: providerName || provider.name,
      service: String(service),
      customerOffer: amount,
      providerCounter: null,
      finalPrice: null,
      status: "customer_offer" as NegotiationStatus,
      // Provider has 20s to respond, otherwise the offer auto-expires.
      expiresAt: nextDeadline(),
      messages: [firstMsg],
    };

    await db.insert(negotiationsTable).values(negotiation);

    emitToUser(negotiation.providerId, "negotiation:new", { negotiation });
    emitToUser(negotiation.customerId, "negotiation:updated", { negotiation });
    notifyUser({
      userId: negotiation.providerId,
      title: "New offer",
      body: `${negotiation.customerName} offered Rs. ${amount} for ${negotiation.service}`,
      type: "negotiation",
      link: `/negotiations/${negotiation.id}`,
      data: { negotiationId: negotiation.id },
    }).catch(() => undefined);

    res.json({ negotiation });
  } catch (e) {
    logger.error({ err: e }, "negotiation create error");
    res.status(500).json({ error: "Failed to create negotiation" });
  }
});

router.patch("/:id/counter", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const amount = toAmount(req.body?.amount);
    const senderName = String(req.body?.senderName || "User");
    const message = String(req.body?.message || "Counter offer sent");

    if (!amount || amount < 100) {
      res.status(400).json({ error: "Enter a valid counter amount" });
      return;
    }

    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;

    const userId = req.user!.userId;
    const role = req.user!.role;
    const isCustomer = neg.customerId === userId;
    const isProvider = neg.providerId === userId;

    if (!isCustomer && !isProvider) {
      res.status(403).json({ error: "You can only update your own negotiations" });
      return;
    }

    if (isClosed(neg.status)) {
      res.status(400).json({ error: "This negotiation is already closed" });
      return;
    }

    const msgs = [...((neg.messages as NegotiationMessage[]) || [])] as NegotiationMessage[];

    let nextStatus: NegotiationStatus;
    let patch: Partial<typeof neg>;

    if (isProvider && role === "provider") {
      nextStatus = "provider_counter";
      patch = {
        providerCounter: amount,
        status: nextStatus,
        // Reset the 20s clock for the customer to respond.
        expiresAt: nextDeadline(),
      } as Partial<typeof neg>;
      msgs.push({
        id: generateId(),
        senderId: userId,
        senderName,
        text: message || `Provider countered Rs. ${amount}`,
        offerAmount: amount,
        timestamp: new Date().toISOString(),
      });
    } else if (isCustomer && role === "customer") {
      nextStatus = "customer_offer";
      patch = {
        customerOffer: amount,
        status: nextStatus,
        // Reset the 20s clock for the provider to respond.
        expiresAt: nextDeadline(),
      } as Partial<typeof neg>;
      msgs.push({
        id: generateId(),
        senderId: userId,
        senderName,
        text: message || `Customer offered Rs. ${amount}`,
        offerAmount: amount,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(403).json({ error: "Invalid negotiation action for this role" });
      return;
    }

    await db
      .update(negotiationsTable)
      .set({
        ...patch,
        messages: msgs,
        updatedAt: new Date(),
      })
      .where(eq(negotiationsTable.id, String(req.params.id)));

    const updated = await db.query.negotiationsTable.findFirst({
      where: eq(negotiationsTable.id, String(req.params.id)),
    });
    if (updated) {
      emitToUser(updated.customerId, "negotiation:updated", { negotiation: updated });
      emitToUser(updated.providerId, "negotiation:updated", { negotiation: updated });
      const recipientId = isProvider ? updated.customerId : updated.providerId;
      const actor = isProvider ? updated.providerName : updated.customerName;
      notifyUser({
        userId: recipientId,
        title: "Counter offer",
        body: `${actor} countered Rs. ${amount}`,
        type: "negotiation",
        link: `/negotiations/${updated.id}`,
        data: { negotiationId: updated.id },
      }).catch(() => undefined);
    }
    res.json({ negotiation: updated });
  } catch (e) {
    logger.error({ err: e }, "negotiation counter error");
    res.status(500).json({ error: "Failed to counter offer" });
  }
});

router.patch("/:id/accept", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;

    const userId = req.user!.userId;
    const role = req.user!.role;

    if (isClosed(neg.status)) {
      res.status(400).json({ error: "This negotiation is already closed" });
      return;
    }

    const isCustomer = neg.customerId === userId && role === "customer";
    const isProvider = neg.providerId === userId && role === "provider";

    let finalPrice: number | null = null;
    let text = "";

    if (isProvider) {
      if (neg.status !== "customer_offer") {
        res.status(400).json({ error: "Provider can only accept the current customer offer" });
        return;
      }
      finalPrice = toAmount(req.body?.finalPrice) ?? neg.customerOffer;
      text = `Provider accepted Rs. ${finalPrice}`;
    } else if (isCustomer) {
      if (neg.status !== "provider_counter" || neg.providerCounter == null) {
        res.status(400).json({ error: "Customer can only accept the current provider counter" });
        return;
      }
      finalPrice = toAmount(req.body?.finalPrice) ?? neg.providerCounter;
      text = `Customer accepted Rs. ${finalPrice}`;
    } else {
      res.status(403).json({ error: "You can only accept your own negotiations" });
      return;
    }

    const msgs = [...((neg.messages as NegotiationMessage[]) || [])] as NegotiationMessage[];
    msgs.push({
      id: generateId(),
      senderId: userId,
      senderName: isProvider ? neg.providerName : neg.customerName,
      text,
      offerAmount: finalPrice ?? undefined,
      timestamp: new Date().toISOString(),
    });

    await db
      .update(negotiationsTable)
      .set({
        status: "accepted",
        finalPrice,
        messages: msgs,
        updatedAt: new Date(),
      })
      .where(eq(negotiationsTable.id, String(req.params.id)));

    const updated = await db.query.negotiationsTable.findFirst({
      where: eq(negotiationsTable.id, String(req.params.id)),
    });

    // Create a confirmed booking from the accepted negotiation —
    // The accepting party agrees to the other's latest terms, so no
    // additional acceptance step is needed.
    let booking: Record<string, unknown> | null = null;
    if (updated && finalPrice) {
      try {
        const customer = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.customerId) });
        const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, updated.providerId) });
        if (customer && provider) {
          const { address, scheduledDate, scheduledTime, service: bookingService } = req.body;
          const bookingId = generateId();
          const now = new Date();
          const bookingRecord = {
            id: bookingId,
            publicId: `ATH-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.floor(10000 + Math.random() * 90000)}`,
            customerId: updated.customerId,
            customerName: customer.name,
            customerPhone: customer.phone,
            providerId: updated.providerId,
            providerName: provider.name,
            providerPhone: provider.phone,
            service: bookingService || updated.service,
            serviceIcon: "tool",
            description: null,
            attachment: null,
            address: address || customer.address || "—",
            scheduledDate: scheduledDate || now.toISOString().split("T")[0],
            scheduledTime: scheduledTime || now.toTimeString().slice(0, 5),
            status: "confirmed",
            price: finalPrice,
            source: "negotiation",
            commissionAmount: 0,
            providerAmount: finalPrice,
            commissionRate: 0,
            visitCharge: 0,
          };
          await db.insert(bookingsTable).values(bookingRecord);
          booking = bookingRecord;

          // Notify both parties about the confirmed booking
          emitToUser(updated.customerId, "booking:new" as EventName, { booking: bookingRecord });
          emitToUser(updated.providerId, "booking:new" as EventName, { booking: bookingRecord });
          emitToRole("admin", "admin:event" as EventName, { type: "booking:new", booking: bookingRecord });
        }
      } catch (bookingErr) {
        logger.error({ err: bookingErr }, "Failed to create booking from negotiation acceptance");
      }
    }

    if (updated) {
      emitToUser(updated.customerId, "negotiation:accepted", { negotiation: updated, booking });
      emitToUser(updated.providerId, "negotiation:accepted", { negotiation: updated, booking });
      const recipientId = isProvider ? updated.customerId : updated.providerId;
      const actor = isProvider ? updated.providerName : updated.customerName;
      notifyUser({
        userId: recipientId,
        title: "Booking confirmed!",
        body: `${actor} accepted Rs. ${finalPrice} — booking confirmed`,
        type: "booking",
        link: booking ? `/bookings/${(booking as any).id}` : `/negotiations/${updated.id}`,
        data: booking ? { bookingId: (booking as any).id } : { negotiationId: updated.id },
      }).catch(() => undefined);
    }
    res.json({ negotiation: updated, booking });
  } catch (e) {
    logger.error({ err: e }, "negotiation accept error");
    res.status(500).json({ error: "Failed to accept offer" });
  }
});

router.patch("/:id/reject", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const neg = await getNegotiationOr404(String(req.params.id), res);
    if (!neg) return;

    const userId = req.user!.userId;
    const role = req.user!.role;
    const isCustomer = neg.customerId === userId && role === "customer";
    const isProvider = neg.providerId === userId && role === "provider";

    if (!isCustomer && !isProvider) {
      res.status(403).json({ error: "You can only reject your own negotiations" });
      return;
    }

    if (isClosed(neg.status)) {
      res.status(400).json({ error: "This negotiation is already closed" });
      return;
    }

    const msgs = [...((neg.messages as NegotiationMessage[]) || [])] as NegotiationMessage[];
    msgs.push({
      id: generateId(),
      senderId: userId,
      senderName: isProvider ? neg.providerName : neg.customerName,
      text: isProvider ? "Provider rejected the offer" : "Customer rejected the counter offer",
      timestamp: new Date().toISOString(),
    });

    await db
      .update(negotiationsTable)
      .set({
        status: "rejected",
        messages: msgs,
        updatedAt: new Date(),
      })
      .where(eq(negotiationsTable.id, String(req.params.id)));

    const updated = await db.query.negotiationsTable.findFirst({
      where: eq(negotiationsTable.id, String(req.params.id)),
    });
    if (updated) {
      emitToUser(updated.customerId, "negotiation:rejected", { negotiation: updated });
      emitToUser(updated.providerId, "negotiation:rejected", { negotiation: updated });
    }
    res.json({ negotiation: updated });
  } catch (e) {
    logger.error({ err: e }, "negotiation reject error");
    res.status(500).json({ error: "Failed to reject offer" });
  }
});

export default router;

