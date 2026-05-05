import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { refundRequestsTable, bookingsTable, usersTable } from "@workspace/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { emitToUser, emitToRole } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";

const router = Router();

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const col = role === "provider" ? refundRequestsTable.providerId : refundRequestsTable.customerId;
    const rows = await db
      .select()
      .from(refundRequestsTable)
      .where(eq(col, userId))
      .orderBy(desc(refundRequestsTable.createdAt));
    res.json({ refunds: rows });
  } catch (e) {
    logger.error({ err: e }, "refunds list error");
    res.status(500).json({ error: "Failed to load refunds" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "customer") {
      res.status(403).json({ error: "Only customers can request refunds" });
      return;
    }
    const userId = req.user!.userId;
    const bookingId = String(req.body?.bookingId || "");
    const reason = String(req.body?.reason || "").trim();
    const amount = Number(req.body?.amountRequested || req.body?.amount);
    const evidenceUrl = req.body?.evidenceUrl ? String(req.body.evidenceUrl) : null;

    if (!bookingId || !reason || reason.length < 10) {
      res.status(400).json({ error: "bookingId and a reason of at least 10 characters are required" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "Valid refund amount required" });
      return;
    }
    const booking = await db.query.bookingsTable.findFirst({ where: eq(bookingsTable.id, bookingId) });
    if (!booking || booking.customerId !== userId) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.status !== "completed" && booking.status !== "cancelled") {
      res.status(400).json({ error: "Refunds can only be requested on completed or cancelled bookings" });
      return;
    }
    const existing = await db.query.refundRequestsTable.findFirst({
      where: and(
        eq(refundRequestsTable.bookingId, bookingId),
        eq(refundRequestsTable.status, "pending"),
      ),
    });
    if (existing) {
      res.status(409).json({ error: "A refund request is already pending for this booking" });
      return;
    }

    const row = {
      id: crypto.randomUUID(),
      bookingId,
      customerId: userId,
      providerId: booking.providerId,
      reason,
      amountRequested: Math.round(amount),
      evidenceUrl: evidenceUrl || null,
      status: "pending" as const,
    };
    await db.insert(refundRequestsTable).values(row);

    emitToRole("admin", "admin:event", { type: "refund_requested", refundId: row.id, bookingId });
    notifyUser({
      userId: booking.providerId,
      title: "Refund / dispute opened",
      body: `Customer requested Rs. ${row.amountRequested} refund on ${booking.service}: ${reason.slice(0, 80)}${reason.length > 80 ? "…" : ""}`,
      type: "system",
      data: { refundId: row.id, bookingId },
    }).catch(() => undefined);

    res.json({ refund: row });
  } catch (e) {
    logger.error({ err: e }, "refund create error");
    res.status(500).json({ error: "Failed to create refund request" });
  }
});

export const refundsAdminRouter = Router();

refundsAdminRouter.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        r: refundRequestsTable,
        booking: { id: bookingsTable.id, service: bookingsTable.service, price: bookingsTable.price },
        customer: { id: usersTable.id, name: usersTable.name, phone: usersTable.phone },
      })
      .from(refundRequestsTable)
      .innerJoin(bookingsTable, eq(bookingsTable.id, refundRequestsTable.bookingId))
      .innerJoin(usersTable, eq(usersTable.id, refundRequestsTable.customerId))
      .orderBy(desc(refundRequestsTable.createdAt));
    res.json({
      refunds: rows.map((r) => ({ ...r.r, booking: r.booking, customer: r.customer })),
    });
  } catch (e) {
    logger.error({ err: e }, "admin refunds list error");
    res.status(500).json({ error: "Failed to load refunds" });
  }
});

refundsAdminRouter.patch("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || "");
    const action = String(req.body?.action || "").toLowerCase();
    const note = String(req.body?.resolutionNote || req.body?.note || "").trim() || null;
    const adminId = req.user?.userId || "admin";
    const row = await db.query.refundRequestsTable.findFirst({ where: eq(refundRequestsTable.id, id) });
    if (!row) {
      res.status(404).json({ error: "Refund not found" });
      return;
    }
    if (action !== "approve" && action !== "reject") {
      res.status(400).json({ error: "action must be approve or reject" });
      return;
    }
    const status = action === "approve" ? "approved" : "rejected";
    await db.update(refundRequestsTable)
      .set({
        status,
        resolutionNote: note,
        resolvedBy: adminId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(refundRequestsTable.id, id));

    notifyUser({
      userId: row.customerId,
      title: status === "approved" ? "Refund approved" : "Refund declined",
      body: status === "approved"
        ? `Your Rs. ${row.amountRequested} refund was approved${note ? `: ${note}` : ""}`
        : `Your refund was declined${note ? `: ${note}` : ""}`,
      type: "system",
      data: { refundId: id, status },
    }).catch(() => undefined);
    emitToUser(row.customerId, "notification:new", { refundId: id, status });
    emitToUser(row.providerId, "notification:new", { refundId: id, status });
    res.json({ ok: true, status });
  } catch (e) {
    logger.error({ err: e }, "admin refund patch error");
    res.status(500).json({ error: "Failed to update refund" });
  }
});

export default router;

