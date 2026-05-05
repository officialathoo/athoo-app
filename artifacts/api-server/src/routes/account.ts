import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  accountDeletionRequestsTable,
  emailChangeRequestsTable,
  phoneChangeRequestsTable,
  serviceAddRequestsTable,
  serviceCategoriesTable,
  auditLogTable,
  notificationsTable,
  adminNotificationsTable,
} from "@workspace/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  requireAuth,
  requireAuthAllowDeactivated,
  requireAdmin,
  type AuthRequest,
} from "../middlewares/auth";

const router = Router();
const id = () => crypto.randomUUID();
const otp = () => crypto.randomInt(100000, 1000000).toString();

// Endpoints that must remain reachable for soft-deactivated / pending-deletion users
router.post("/reactivate", requireAuthAllowDeactivated, async (req: AuthRequest, res) => {
  await db
    .update(usersTable)
    .set({ isDeactivated: false, accountStatus: "active", deletionScheduledAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user!.userId));
  return res.json({ success: true });
});

router.post("/delete-request/cancel", requireAuthAllowDeactivated, async (req: AuthRequest, res) => {
  try {
    const pending = await db.query.accountDeletionRequestsTable.findFirst({
      where: and(
        eq(accountDeletionRequestsTable.userId, req.user!.userId),
        eq(accountDeletionRequestsTable.status, "pending"),
      ),
    });
    if (pending) {
      await db
        .update(accountDeletionRequestsTable)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(accountDeletionRequestsTable.id, pending.id));
    }
    await db
      .update(usersTable)
      .set({
        accountStatus: "active",
        deletionScheduledAt: null,
        isDeactivated: false,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.user!.userId));
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.cancel-delete error");
    return res.status(500).json({ error: "Failed to cancel deletion" });
  }
});

router.use(requireAuth);

// PROFILE — get current user profile
router.get("/profile", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password, ...safe } = user as any;
    return res.json({ user: safe });
  } catch (e) {
    logger.error({ err: e }, "account.profile.get error");
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// PROFILE — update editable fields
router.patch("/profile", async (req: AuthRequest, res) => {
  try {
    const allowed = [
      "name",
      "fatherName",
      "bio",
      "experience",
      "location",
      "profileImage",
      "profileColor",
      "ratePerHour",
      "language",
      "biometricEnabled",
      "isAvailable",
      "expoPushToken",
    ] as const;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of allowed) {
      if (req.body && req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await db.update(usersTable).set(patch).where(eq(usersTable.id, req.user!.userId));
    const row = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (row && (row as any).password) (row as any).password = undefined;
    return res.json({ user: row });
  } catch (e) {
    logger.error({ err: e }, "account.profile error");
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// PASSWORD — change with old-password verification
router.post("/password", async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body ?? {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.password) {
      const ok = await bcrypt.compare(String(oldPassword ?? ""), user.password);
      if (!ok) return res.status(401).json({ error: "Old password is incorrect" });
    }
    const hashed = await bcrypt.hash(String(newPassword), 10);
    await db.update(usersTable).set({ password: hashed, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.password error");
    return res.status(500).json({ error: "Failed to change password" });
  }
});

// DEACTIVATE — temporary
router.post("/deactivate", async (req: AuthRequest, res) => {
  try {
    const { password } = req.body ?? {};
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.password) {
      const ok = await bcrypt.compare(String(password ?? ""), user.password);
      if (!ok) return res.status(401).json({ error: "Password is incorrect" });
    }
    await db
      .update(usersTable)
      .set({ isDeactivated: true, accountStatus: "deactivated", updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.deactivate error");
    return res.status(500).json({ error: "Failed to deactivate account" });
  }
});

// DELETION — schedules deletion 7 days out, can be cancelled until then
router.post("/delete-request", async (req: AuthRequest, res) => {
  try {
    const { password, reason } = req.body ?? {};
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.password) {
      const ok = await bcrypt.compare(String(password ?? ""), user.password);
      if (!ok) return res.status(401).json({ error: "Password is incorrect" });
    }
    const scheduledDeleteAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newId = id();
    await db.insert(accountDeletionRequestsTable).values({
      id: newId,
      userId: user.id,
      reason: reason ? String(reason) : null,
      scheduledDeleteAt,
      status: "pending",
    });
    await db
      .update(usersTable)
      .set({
        accountStatus: "pending_deletion",
        deletionScheduledAt: scheduledDeleteAt,
        isDeactivated: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));
    await db.insert(adminNotificationsTable).values({
      id: id(),
      title: "Account deletion requested",
      message: `${user.name} (${user.role}) scheduled deletion`,
      type: "warning",
      link: `/admin/users/${user.id}`,
    });
    return res.json({ success: true, scheduledDeleteAt });
  } catch (e) {
    logger.error({ err: e }, "account.delete-request error");
    return res.status(500).json({ error: "Failed to schedule deletion" });
  }
});

// EMAIL change — request OTP, then verify
router.post("/email/request", async (req: AuthRequest, res) => {
  const { newEmail } = req.body ?? {};
  if (!newEmail || !/.+@.+\..+/.test(String(newEmail))) {
    return res.status(400).json({ error: "Valid new email required" });
  }
  const code = otp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(emailChangeRequestsTable).values({
    id: id(),
    userId: req.user!.userId,
    newEmail: String(newEmail).toLowerCase().trim(),
    otpCode: code,
    expiresAt,
  });
  const isDev = process.env.NODE_ENV !== "production";
  return res.json({ success: true, ...(isDev ? { code } : {}) });
});

router.post("/email/verify", async (req: AuthRequest, res) => {
  const { code } = req.body ?? {};
  const reqRow = await db.query.emailChangeRequestsTable.findFirst({
    where: and(
      eq(emailChangeRequestsTable.userId, req.user!.userId),
      eq(emailChangeRequestsTable.otpCode, String(code ?? "")),
      eq(emailChangeRequestsTable.verified, false),
      gt(emailChangeRequestsTable.expiresAt, new Date()),
    ),
    orderBy: desc(emailChangeRequestsTable.createdAt),
  });
  if (!reqRow) return res.status(400).json({ error: "Invalid or expired code" });
  await db.transaction(async (tx) => {
    await tx
      .update(emailChangeRequestsTable)
      .set({ verified: true })
      .where(eq(emailChangeRequestsTable.id, reqRow.id));
    await tx
      .update(usersTable)
      .set({ email: reqRow.newEmail, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
  });
  return res.json({ success: true, email: reqRow.newEmail });
});

// PHONE change — request OTP, then verify
router.post("/phone/request", async (req: AuthRequest, res) => {
  const { newPhone } = req.body ?? {};
  if (!newPhone || String(newPhone).replace(/\D/g, "").length < 10) {
    return res.status(400).json({ error: "Valid new phone required" });
  }
  const code = otp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.insert(phoneChangeRequestsTable).values({
    id: id(),
    userId: req.user!.userId,
    newPhone: String(newPhone).trim(),
    otpCode: code,
    expiresAt,
  });
  const isDev = process.env.NODE_ENV !== "production";
  return res.json({ success: true, ...(isDev ? { code } : {}) });
});

router.post("/phone/verify", async (req: AuthRequest, res) => {
  const { code } = req.body ?? {};
  const reqRow = await db.query.phoneChangeRequestsTable.findFirst({
    where: and(
      eq(phoneChangeRequestsTable.userId, req.user!.userId),
      eq(phoneChangeRequestsTable.otpCode, String(code ?? "")),
      eq(phoneChangeRequestsTable.verified, false),
      gt(phoneChangeRequestsTable.expiresAt, new Date()),
    ),
    orderBy: desc(phoneChangeRequestsTable.createdAt),
  });
  if (!reqRow) return res.status(400).json({ error: "Invalid or expired code" });
  const taken = await db.query.usersTable.findFirst({
    where: eq(usersTable.phone, reqRow.newPhone),
  });
  if (taken && taken.id !== req.user!.userId) {
    return res.status(409).json({ error: "Phone number already in use" });
  }
  await db.transaction(async (tx) => {
    await tx
      .update(phoneChangeRequestsTable)
      .set({ verified: true })
      .where(eq(phoneChangeRequestsTable.id, reqRow.id));
    await tx
      .update(usersTable)
      .set({ phone: reqRow.newPhone, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
  });
  return res.json({ success: true, phone: reqRow.newPhone });
});

// SERVICE add request — provider asks to be approved for a new category
router.post("/services/request", async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "provider") {
      return res.status(403).json({ error: "Only providers can request new services" });
    }
    const { serviceCategoryId, serviceName, documents, note } = req.body ?? {};
    let resolvedCategoryId: string | null = null;
    let resolvedName = "";
    if (serviceCategoryId) {
      const cat = await db.query.serviceCategoriesTable.findFirst({
        where: eq(serviceCategoriesTable.id, String(serviceCategoryId)),
      });
      if (!cat) return res.status(404).json({ error: "Category not found" });
      resolvedCategoryId = cat.id;
      resolvedName = cat.name;
    } else if (typeof serviceName === "string" && serviceName.trim()) {
      resolvedName = serviceName.trim();
    } else {
      return res.status(400).json({ error: "serviceCategoryId or serviceName required" });
    }
    const newId = id();
    await db.insert(serviceAddRequestsTable).values({
      id: newId,
      providerId: req.user!.userId,
      serviceCategoryId: resolvedCategoryId,
      serviceName: resolvedName,
      documents: Array.isArray(documents) ? documents : [],
      note: typeof note === "string" ? note : null,
      status: "pending",
    });
    await db.insert(adminNotificationsTable).values({
      id: id(),
      title: "New service add request",
      message: `Provider requested to add "${resolvedName}"`,
      type: "info",
      link: `/admin/service-requests/${newId}`,
    });
    return res.status(201).json({ requestId: newId });
  } catch (e) {
    logger.error({ err: e }, "account.service-request error");
    return res.status(500).json({ error: "Failed to submit request" });
  }
});

router.get("/services/requests", async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(serviceAddRequestsTable)
    .where(eq(serviceAddRequestsTable.providerId, req.user!.userId))
    .orderBy(desc(serviceAddRequestsTable.createdAt));
  return res.json({ requests: rows });
});

// ADMIN sub-router — service add request review + deletion request management
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/service-requests", async (req, res) => {
  const status = String(req.query.status ?? "");
  const where = status ? eq(serviceAddRequestsTable.status, status) : undefined;
  const rows = await db
    .select({
      id: serviceAddRequestsTable.id,
      providerId: serviceAddRequestsTable.providerId,
      providerName: usersTable.name,
      providerPhone: usersTable.phone,
      serviceCategoryId: serviceAddRequestsTable.serviceCategoryId,
      serviceName: serviceAddRequestsTable.serviceName,
      documents: serviceAddRequestsTable.documents,
      note: serviceAddRequestsTable.note,
      status: serviceAddRequestsTable.status,
      createdAt: serviceAddRequestsTable.createdAt,
    })
    .from(serviceAddRequestsTable)
    .leftJoin(usersTable, eq(serviceAddRequestsTable.providerId, usersTable.id))
    .where(where as any)
    .orderBy(desc(serviceAddRequestsTable.createdAt))
    .limit(200);
  return res.json({ requests: rows });
});

adminRouter.post("/service-requests/:id/approve", async (req: AuthRequest, res) => {
  try {
    const reqRow = await db.query.serviceAddRequestsTable.findFirst({
      where: eq(serviceAddRequestsTable.id, req.params.id),
    });
    if (!reqRow) return res.status(404).json({ error: "Request not found" });
    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, reqRow.providerId),
    });
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    const services = Array.isArray(provider.services) ? provider.services : [];
    if (!services.includes(reqRow.serviceName)) services.push(reqRow.serviceName);
    await db.transaction(async (tx) => {
      await tx
        .update(serviceAddRequestsTable)
        .set({
          status: "approved",
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(serviceAddRequestsTable.id, reqRow.id));
      await tx
        .update(usersTable)
        .set({ services, updatedAt: new Date() })
        .where(eq(usersTable.id, provider.id));
      await tx.insert(notificationsTable).values({
        id: id(),
        userId: provider.id,
        title: "Service approved",
        body: `Your request to add "${reqRow.serviceName}" has been approved.`,
        type: "system",
      });
    });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.service-approve error");
    return res.status(500).json({ error: "Failed to approve" });
  }
});

adminRouter.post("/service-requests/:id/reject", async (req: AuthRequest, res) => {
  try {
    const reason = String(req.body?.reason ?? "").trim();
    const reqRow = await db.query.serviceAddRequestsTable.findFirst({
      where: eq(serviceAddRequestsTable.id, req.params.id),
    });
    if (!reqRow) return res.status(404).json({ error: "Request not found" });
    await db
      .update(serviceAddRequestsTable)
      .set({
        status: "rejected",
        rejectionNote: reason || null,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serviceAddRequestsTable.id, reqRow.id));
    await db.insert(notificationsTable).values({
      id: id(),
      userId: reqRow.providerId,
      title: "Service request rejected",
      body: reason || `Your request to add "${reqRow.serviceName}" was rejected.`,
      type: "system",
    });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "account.service-reject error");
    return res.status(500).json({ error: "Failed to reject" });
  }
});

adminRouter.get("/deletion-requests", async (req, res) => {
  const status = String(req.query.status ?? "pending");
  const rows = await db
    .select({
      id: accountDeletionRequestsTable.id,
      userId: accountDeletionRequestsTable.userId,
      userName: usersTable.name,
      userPhone: usersTable.phone,
      reason: accountDeletionRequestsTable.reason,
      scheduledDeleteAt: accountDeletionRequestsTable.scheduledDeleteAt,
      status: accountDeletionRequestsTable.status,
      createdAt: accountDeletionRequestsTable.createdAt,
    })
    .from(accountDeletionRequestsTable)
    .leftJoin(usersTable, eq(accountDeletionRequestsTable.userId, usersTable.id))
    .where(eq(accountDeletionRequestsTable.status, status))
    .orderBy(desc(accountDeletionRequestsTable.createdAt));
  return res.json({ requests: rows });
});

adminRouter.post("/deletion-requests/:id/cancel", async (req: AuthRequest, res) => {
  const r = await db.query.accountDeletionRequestsTable.findFirst({
    where: eq(accountDeletionRequestsTable.id, req.params.id),
  });
  if (!r) return res.status(404).json({ error: "Request not found" });
  await db
    .update(accountDeletionRequestsTable)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(accountDeletionRequestsTable.id, r.id));
  await db
    .update(usersTable)
    .set({
      accountStatus: "active",
      deletionScheduledAt: null,
      isDeactivated: false,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, r.userId));
  return res.json({ success: true });
});

export { adminRouter as accountAdminRouter };
export default router;

