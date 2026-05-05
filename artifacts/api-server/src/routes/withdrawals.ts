import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { withdrawalRequestsTable, usersTable } from "@workspace/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { emitToUser, emitToRole } from "../lib/eventBus";
import { notifyUser } from "../lib/notifications";

const router = Router();

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.providerId, userId))
      .orderBy(desc(withdrawalRequestsTable.createdAt));
    res.json({ withdrawals: rows });
  } catch (e) {
    logger.error({ err: e }, "withdrawals list error");
    res.status(500).json({ error: "Failed to load withdrawals" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Only providers can request withdrawals" });
      return;
    }
    const userId = req.user!.userId;
    const amount = Number(req.body?.amount);
    const accountTitle = String(req.body?.accountTitle || "").trim();
    const accountNumber = String(req.body?.accountNumber || "").trim();
    const bankName = String(req.body?.bankName || "").trim() || null;
    const iban = String(req.body?.iban || "").trim() || null;
    const note = String(req.body?.note || "").trim() || null;

    if (!Number.isFinite(amount) || amount < 500) {
      res.status(400).json({ error: "Minimum withdrawal amount is Rs. 500" });
      return;
    }
    if (!accountTitle || !accountNumber) {
      res.status(400).json({ error: "Account title and number are required" });
      return;
    }

    const me = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    if (!me) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (me.isBlocked) {
      res.status(403).json({ error: "Blocked accounts cannot request withdrawals" });
      return;
    }
    // Block if there is already a pending request — keeps the queue clean.
    const pending = await db.query.withdrawalRequestsTable.findFirst({
      where: and(
        eq(withdrawalRequestsTable.providerId, userId),
        eq(withdrawalRequestsTable.status, "pending"),
      ),
    });
    if (pending) {
      res.status(409).json({ error: "You already have a pending withdrawal request" });
      return;
    }

    const row = {
      id: crypto.randomUUID(),
      providerId: userId,
      amount: Math.round(amount),
      accountTitle,
      accountNumber,
      bankName,
      iban,
      note,
      status: "pending" as const,
    };
    await db.insert(withdrawalRequestsTable).values(row);

    emitToRole("admin", "notification:new", { type: "withdrawal", providerId: userId, amount: row.amount });

    res.json({ withdrawal: row });
  } catch (e) {
    logger.error({ err: e }, "withdrawal create error");
    res.status(500).json({ error: "Failed to create withdrawal request" });
  }
});

export const withdrawalsAdminRouter = Router();

withdrawalsAdminRouter.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        w: withdrawalRequestsTable,
        provider: { id: usersTable.id, name: usersTable.name, phone: usersTable.phone },
      })
      .from(withdrawalRequestsTable)
      .innerJoin(usersTable, eq(usersTable.id, withdrawalRequestsTable.providerId))
      .orderBy(desc(withdrawalRequestsTable.createdAt));
    res.json({ withdrawals: rows.map((r) => ({ ...r.w, provider: r.provider })) });
  } catch (e) {
    logger.error({ err: e }, "admin withdrawals list error");
    res.status(500).json({ error: "Failed to load withdrawals" });
  }
});

withdrawalsAdminRouter.patch("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id || "");
    const action = String(req.body?.action || "").toLowerCase();
    const note = String(req.body?.note || "").trim() || null;
    const reference = String(req.body?.paymentReference || "").trim() || null;
    const adminId = req.user?.userId || "admin";

    const w = await db.query.withdrawalRequestsTable.findFirst({
      where: eq(withdrawalRequestsTable.id, id),
    });
    if (!w) {
      res.status(404).json({ error: "Withdrawal not found" });
      return;
    }

    let newStatus: "approved" | "rejected" | "paid" | null = null;
    if (action === "approve") newStatus = "approved";
    else if (action === "reject") newStatus = "rejected";
    else if (action === "paid") newStatus = "paid";
    else {
      res.status(400).json({ error: "action must be approve | reject | paid" });
      return;
    }

    await db.update(withdrawalRequestsTable)
      .set({
        status: newStatus,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionNote: newStatus === "rejected" ? note : null,
        paidAt: newStatus === "paid" ? new Date() : w.paidAt,
        paymentReference: reference || w.paymentReference,
        updatedAt: new Date(),
      })
      .where(eq(withdrawalRequestsTable.id, id));

    notifyUser({
      userId: w.providerId,
      title: newStatus === "paid" ? "Withdrawal paid" : `Withdrawal ${newStatus}`,
      body: newStatus === "rejected"
        ? `Your Rs. ${w.amount} withdrawal was rejected${note ? `: ${note}` : ""}`
        : newStatus === "paid"
          ? `Your Rs. ${w.amount} withdrawal has been paid${reference ? ` (ref: ${reference})` : ""}`
          : `Your Rs. ${w.amount} withdrawal was approved and is being processed`,
      type: "system",
      data: { withdrawalId: id, status: newStatus },
    }).catch(() => undefined);
    emitToUser(w.providerId, "notification:new", { withdrawalId: id, status: newStatus });

    res.json({ ok: true, status: newStatus });
  } catch (e) {
    logger.error({ err: e }, "admin withdrawal patch error");
    res.status(500).json({ error: "Failed to update withdrawal" });
  }
});

export default router;

