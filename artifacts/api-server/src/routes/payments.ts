import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { getPlatformSettings } from "../lib/admin";
import { db } from "@workspace/db";
import {
  commissionPaymentsTable,
  paymentAccountsTable,
  usersTable,
  notificationsTable,
  adminNotificationsTable,
  auditLogTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  type AuthRequest,
} from "../middlewares/auth";

const router = Router();
const id = () => crypto.randomUUID();

router.use(requireAuth);

// LIST active payment accounts (any logged-in user can see where to pay)
router.get("/accounts", async (_req, res) => {
  const rows = await db
    .select()
    .from(paymentAccountsTable)
    .where(eq(paymentAccountsTable.isActive, true))
    .orderBy(asc(paymentAccountsTable.sortOrder), asc(paymentAccountsTable.label));
  return res.json({ accounts: rows });
});

// LIST my commission payments
router.get("/me", async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(commissionPaymentsTable)
    .where(eq(commissionPaymentsTable.providerId, req.user!.userId))
    .orderBy(desc(commissionPaymentsTable.createdAt));
  return res.json({ payments: rows });
});

// SUBMIT a new commission payment
router.post("/", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "provider") {
      return res.status(403).json({ error: "Only providers can submit commission payments" });
    }
    const { amount, accountId, reference, screenshotUrl, note } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "Amount must be greater than zero" });
    }
    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    const pending = provider.pendingCommission ?? 0;
    if (amt > pending) {
      return res
        .status(400)
        .json({ error: `Amount cannot exceed pending commission (${pending})` });
    }
    const newId = id();
    await db.insert(commissionPaymentsTable).values({
      id: newId,
      providerId: provider.id,
      amount: amt,
      accountId: typeof accountId === "string" ? accountId : null,
      reference: typeof reference === "string" ? reference : null,
      screenshotUrl: typeof screenshotUrl === "string" ? screenshotUrl : null,
      note: typeof note === "string" ? note : null,
      status: "pending",
    });
    await db.insert(adminNotificationsTable).values({
      id: id(),
      title: "New commission payment",
      message: `${provider.name} submitted a payment of Rs ${amt}`,
      type: "info",
      link: `/admin/payments/${newId}`,
    });
    return res.status(201).json({ paymentId: newId });
  } catch (e) {
    logger.error({ err: e }, "payments.submit error");
    return res.status(500).json({ error: "Failed to submit payment" });
  }
});

// ADMIN sub-router
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// Payment accounts CRUD
adminRouter.get("/accounts", async (_req, res) => {
  const rows = await db
    .select()
    .from(paymentAccountsTable)
    .orderBy(asc(paymentAccountsTable.sortOrder), asc(paymentAccountsTable.label));
  return res.json({ accounts: rows });
});

adminRouter.post("/accounts", async (req: AuthRequest, res) => {
  try {
    const { label, bankName, accountTitle, accountNumber, iban, instructions, isActive, sortOrder } =
      req.body ?? {};
    if (!label || !accountTitle || !accountNumber) {
      return res.status(400).json({ error: "label, accountTitle, accountNumber are required" });
    }
    const newId = id();
    await db.insert(paymentAccountsTable).values({
      id: newId,
      label: String(label).trim(),
      bankName: bankName ? String(bankName).trim() : null,
      accountTitle: String(accountTitle).trim(),
      accountNumber: String(accountNumber).trim(),
      iban: iban ? String(iban).trim() : null,
      instructions: instructions ? String(instructions) : null,
      isActive: isActive !== false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    });
    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminUser?.name ?? "Admin",
      action: "payment_account.create",
      target: "payment_account",
      targetId: newId,
      ip: req.ip ?? null,
    });
    const row = await db.query.paymentAccountsTable.findFirst({
      where: eq(paymentAccountsTable.id, newId),
    });
    return res.status(201).json({ account: row });
  } catch (e) {
    logger.error({ err: e }, "payments.account.create error");
    return res.status(500).json({ error: "Failed to create account" });
  }
});

adminRouter.patch("/accounts/:id", async (req: AuthRequest, res) => {
  try {
    const acct = await db.query.paymentAccountsTable.findFirst({
      where: eq(paymentAccountsTable.id, req.params.id),
    });
    if (!acct) return res.status(404).json({ error: "Account not found" });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const { label, bankName, accountTitle, accountNumber, iban, instructions, isActive, sortOrder } =
      req.body ?? {};
    if (typeof label === "string" && label.trim()) patch.label = label.trim();
    if (typeof bankName === "string") patch.bankName = bankName.trim() || null;
    if (typeof accountTitle === "string" && accountTitle.trim()) patch.accountTitle = accountTitle.trim();
    if (typeof accountNumber === "string" && accountNumber.trim()) patch.accountNumber = accountNumber.trim();
    if (typeof iban === "string") patch.iban = iban.trim() || null;
    if (typeof instructions === "string") patch.instructions = instructions;
    if (typeof isActive === "boolean") patch.isActive = isActive;
    if (Number.isFinite(Number(sortOrder))) patch.sortOrder = Number(sortOrder);
    await db.update(paymentAccountsTable).set(patch).where(eq(paymentAccountsTable.id, acct.id));
    const row = await db.query.paymentAccountsTable.findFirst({
      where: eq(paymentAccountsTable.id, acct.id),
    });
    return res.json({ account: row });
  } catch (e) {
    logger.error({ err: e }, "payments.account.update error");
    return res.status(500).json({ error: "Failed to update account" });
  }
});

adminRouter.delete("/accounts/:id", async (req: AuthRequest, res) => {
  await db
    .update(paymentAccountsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(paymentAccountsTable.id, req.params.id));
  return res.json({ success: true });
});

// Commission payments — list/approve/reject
adminRouter.get("/commission", async (req, res) => {
  const status = String(req.query.status ?? "");
  const where = status ? eq(commissionPaymentsTable.status, status) : undefined;
  const rows = await db
    .select({
      id: commissionPaymentsTable.id,
      providerId: commissionPaymentsTable.providerId,
      providerName: usersTable.name,
      providerPhone: usersTable.phone,
      amount: commissionPaymentsTable.amount,
      accountId: commissionPaymentsTable.accountId,
      reference: commissionPaymentsTable.reference,
      screenshotUrl: commissionPaymentsTable.screenshotUrl,
      note: commissionPaymentsTable.note,
      status: commissionPaymentsTable.status,
      reviewedAt: commissionPaymentsTable.reviewedAt,
      rejectionNote: commissionPaymentsTable.rejectionNote,
      createdAt: commissionPaymentsTable.createdAt,
    })
    .from(commissionPaymentsTable)
    .leftJoin(usersTable, eq(commissionPaymentsTable.providerId, usersTable.id))
    .where(where as any)
    .orderBy(desc(commissionPaymentsTable.createdAt))
    .limit(200);
  return res.json({ payments: rows });
});

adminRouter.post("/commission/:id/approve", async (req: AuthRequest, res) => {
  try {
    const pay = await db.query.commissionPaymentsTable.findFirst({
      where: eq(commissionPaymentsTable.id, req.params.id),
    });
    if (!pay) return res.status(404).json({ error: "Payment not found" });
    if (pay.status === "approved") return res.json({ payment: pay });

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, pay.providerId),
    });
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const newPending = Math.max(0, (provider.pendingCommission ?? 0) - pay.amount);
    const settings = await getPlatformSettings();
    const commissionLimit = Number(provider.commissionLimit || settings.defaultCommissionLimit || 5000);
    const shouldUnblock = provider.isBlocked && newPending < commissionLimit;

    await db.transaction(async (tx) => {
      await tx
        .update(commissionPaymentsTable)
        .set({
          status: "approved",
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(commissionPaymentsTable.id, pay.id));
      await tx
        .update(usersTable)
        .set({
          pendingCommission: newPending,
          isBlocked: shouldUnblock ? false : provider.isBlocked,
          blockedReason: shouldUnblock ? null : provider.blockedReason,
          lastCommissionPaymentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, provider.id));
      await tx.insert(notificationsTable).values({
        id: id(),
        userId: provider.id,
        title: "Payment approved",
        body: `Your commission payment of Rs ${pay.amount} has been approved.`,
        type: "system",
      });
      const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
      await tx.insert(auditLogTable).values({
        id: id(),
        adminId: req.user!.userId,
        adminName: adminUser?.name ?? "Admin",
        action: "payment.approve",
        target: "commission_payment",
        targetId: pay.id,
        details: { providerId: provider.id, amount: pay.amount },
        ip: req.ip ?? null,
      });
    });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "payments.approve error");
    return res.status(500).json({ error: "Failed to approve payment" });
  }
});

adminRouter.post("/commission/:id/reject", async (req: AuthRequest, res) => {
  try {
    const reason = String(req.body?.reason ?? "").trim();
    const pay = await db.query.commissionPaymentsTable.findFirst({
      where: eq(commissionPaymentsTable.id, req.params.id),
    });
    if (!pay) return res.status(404).json({ error: "Payment not found" });
    await db
      .update(commissionPaymentsTable)
      .set({
        status: "rejected",
        rejectionNote: reason || null,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(commissionPaymentsTable.id, pay.id));
    await db.insert(notificationsTable).values({
      id: id(),
      userId: pay.providerId,
      title: "Payment rejected",
      body: reason || "Your commission payment was rejected. Please contact support.",
      type: "system",
    });
    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminUser?.name ?? "Admin",
      action: "payment.reject",
      target: "commission_payment",
      targetId: pay.id,
      details: { reason },
      ip: req.ip ?? null,
    });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "payments.reject error");
    return res.status(500).json({ error: "Failed to reject payment" });
  }
});

export { adminRouter as paymentsAdminRouter };
export default router;

