import { Router } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import {
  adminBroadcastsTable,
  adminBlacklistTable,
  adminNotificationsTable,
  auditLogTable,
  bookingsTable,
  notificationsTable,
  promotionsTable,
  providerDocumentsTable,
  supportTicketsTable,
  ticketNotesTable,
  usersTable,
  serviceCategoriesTable,
  commissionPaymentsTable,
  serviceAddRequestsTable,
  accountDeletionRequestsTable,
  userSubscriptionsTable,
  loginHistoryTable,
  withdrawalRequestsTable,
  refundRequestsTable,
  hourlyRateRequestsTable,
} from "@workspace/db/schema";
import { and, between, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import {
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
  requirePermission,
  type AuthRequest,
} from "../middlewares/auth";
import {
  DEFAULT_PLATFORM_SETTINGS,
  generateId,
  getPlatformSettings,
  savePlatformSettings,
  toSafeUser,
} from "../lib/admin";
import {
  getAudiencePushTokens,
  sendExpoPushNotifications,
} from "../lib/push";
import { notifyUser } from "../lib/notifications";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/me", async (req: AuthRequest, res) => {
  try {
    const admin = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    return res.json({ admin: toSafeUser(admin) });
  } catch (error) {
    logger.error({ err: error }, "admin me error");
    return res.status(500).json({ error: "Failed to load admin profile" });
  }
});

router.get("/dashboard", async (_req, res) => {
  try {
    const [
      users,
      providers,
      customers,
      admins,
      blockedProviders,
      pendingBookings,
      activeBookings,
      completedBookings,
      cancelledBookings,
      pendingVerification,
      approvedVerification,
      openSupportTickets,
      activePromotions,
      activeCategories,
      pendingCommissionPayments,
      pendingServiceRequests,
      pendingDeletionRequests,
      pendingSubscriptions,
      activeSubscriptions,
      premiumUsers,
    ] = await Promise.all([
      db.$count(usersTable),
      db.$count(usersTable, eq(usersTable.role, "provider")),
      db.$count(usersTable, eq(usersTable.role, "customer")),
      db.$count(usersTable, eq(usersTable.role, "admin")),
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.isBlocked, true))),
      db.$count(bookingsTable, eq(bookingsTable.status, "pending")),
      db.$count(bookingsTable, eq(bookingsTable.status, "in_progress")),
      db.$count(bookingsTable, eq(bookingsTable.status, "completed")),
      db.$count(bookingsTable, eq(bookingsTable.status, "cancelled")),
      db.$count(usersTable, eq(usersTable.isVerified, false)),
      db.$count(usersTable, eq(usersTable.isVerified, true)),
      db.$count(supportTicketsTable, eq(supportTicketsTable.status, "open")),
      db.$count(promotionsTable, eq(promotionsTable.isActive, true)),
      db.$count(serviceCategoriesTable, eq(serviceCategoriesTable.isActive, true)),
      db.$count(commissionPaymentsTable, eq(commissionPaymentsTable.status, "pending")),
      db.$count(serviceAddRequestsTable, eq(serviceAddRequestsTable.status, "pending")),
      db.$count(accountDeletionRequestsTable, eq(accountDeletionRequestsTable.status, "pending")),
      db.$count(userSubscriptionsTable, eq(userSubscriptionsTable.status, "pending")),
      db.$count(userSubscriptionsTable, eq(userSubscriptionsTable.status, "active")),
      db.$count(usersTable, eq(usersTable.isPremium, true)),
    ]);

    const [commissionRows, revenueRows, recentBookings] = await Promise.all([
      db.select({
        totalCommission: sql<number>`coalesce(sum(${usersTable.totalCommission}), 0)`,
        pendingCommission: sql<number>`coalesce(sum(${usersTable.pendingCommission}), 0)`,
      }).from(usersTable).where(eq(usersTable.role, "provider")),
      db.select({
        totalRevenue: sql<number>`coalesce(sum(${bookingsTable.price}), 0)`,
      }).from(bookingsTable).where(eq(bookingsTable.status, "completed")),
      db.execute<{ id: string; service: string; status: string; price: number | null; customer_name: string | null; provider_name: string | null; created_at: Date }>(
        sql`SELECT b.id, b.service, b.status, b.price, cu.name AS customer_name, pu.name AS provider_name, b.created_at FROM bookings b LEFT JOIN users cu ON cu.id = b.customer_id LEFT JOIN users pu ON pu.id = b.provider_id ORDER BY b.created_at DESC LIMIT 8`
      ),
    ]);

    const settings = await getPlatformSettings();

    return res.json({
      dashboard: {
        users,
        providers,
        customers,
        admins,
        blockedProviders,
        pendingBookings,
        activeBookings,
        completedBookings,
        cancelledBookings,
        pendingVerification,
        approvedVerification,
        openSupportTickets: Number(openSupportTickets),
        activePromotions: Number(activePromotions),
        activeCategories: Number(activeCategories),
        pendingCommissionPayments: Number(pendingCommissionPayments),
        pendingServiceRequests: Number(pendingServiceRequests),
        pendingDeletionRequests: Number(pendingDeletionRequests),
        pendingSubscriptions: Number(pendingSubscriptions),
        activeSubscriptions: Number(activeSubscriptions),
        premiumUsers: Number(premiumUsers),
        totalCommission: Number(commissionRows[0]?.totalCommission || 0),
        pendingCommission: Number(commissionRows[0]?.pendingCommission || 0),
        totalRevenue: Number(revenueRows[0]?.totalRevenue || 0),
        recentBookings: Array.isArray(recentBookings) ? recentBookings.map((b: any) => ({
          id: b.id,
          service: b.service,
          status: b.status,
          price: b.price,
          customerName: b.customer_name,
          providerName: b.provider_name,
          createdAt: b.created_at,
        })) : (recentBookings as any)?.rows?.map((b: any) => ({
          id: b.id,
          service: b.service,
          status: b.status,
          price: b.price,
          customerName: b.customer_name,
          providerName: b.provider_name,
          createdAt: b.created_at,
        })) ?? [],
        settings,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "admin dashboard error");
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const role =
      typeof req.query.role === "string" && req.query.role.trim()
        ? req.query.role.trim()
        : undefined;
    const search =
      typeof req.query.search === "string" && req.query.search.trim()
        ? req.query.search.trim()
        : undefined;

    const conditions = [] as any[];
    if (role) conditions.push(eq(usersTable.role, role));
    if (search) {
      conditions.push(
        or(
          ilike(usersTable.name, `%${search}%`),
          ilike(usersTable.phone, `%${search}%`),
          ilike(usersTable.email, `%${search}%`)
        )
      );
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const users = await db
      .select()
      .from(usersTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(usersTable.updatedAt))
      .limit(limit)
      .offset(offset);

    return res.json({ users: users.map((user) => toSafeUser(user)), page, limit });
  } catch (error) {
    logger.error({ err: error }, "admin users error");
    return res.status(500).json({ error: "Failed to load users" });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: toSafeUser(user) });
  } catch (error) {
    logger.error({ err: error }, "admin user detail error");
    return res.status(500).json({ error: "Failed to load user details" });
  }
});

router.patch("/users/:id/status", async (req: AuthRequest, res) => {
  try {
    const {
      isDeactivated,
      isBlocked,
      blockedReason,
      adminNotes,
      isVerified,
    } = req.body as Record<string, any>;

    await db
      .update(usersTable)
      .set({
        isDeactivated:
          typeof isDeactivated === "boolean" ? isDeactivated : undefined,
        isBlocked: typeof isBlocked === "boolean" ? isBlocked : undefined,
        blockedReason: blockedReason ?? undefined,
        adminNotes: adminNotes ?? undefined,
        isVerified: typeof isVerified === "boolean" ? isVerified : undefined,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.params.id));

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id),
    });

    await logAdminAction(req, "user_status_updated", "user", req.params.id, { isDeactivated, isBlocked, isVerified });
    return res.json({ user: toSafeUser(user) });
  } catch (error) {
    logger.error({ err: error }, "admin user status error");
    return res.status(500).json({ error: "Failed to update user status" });
  }
});

router.get("/providers", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const providers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "provider"))
      .orderBy(desc(usersTable.updatedAt))
      .limit(limit)
      .offset(offset);

    return res.json({
      providers: providers.map((provider) => toSafeUser(provider)),
      page,
      limit,
    });
  } catch (error) {
    logger.error({ err: error }, "admin providers error");
    return res.status(500).json({ error: "Failed to load providers" });
  }
});

router.patch("/providers/:id/commission-limit", async (req: AuthRequest, res) => {
  try {
    const limit = Number((req.body as any).commissionLimit);
    if (!Number.isFinite(limit) || limit < 0) {
      return res.status(400).json({ error: "Valid commissionLimit is required" });
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id),
    });
    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider not found" });
    }

    const shouldBlock = Number(provider.pendingCommission || 0) >= limit;
    await db
      .update(usersTable)
      .set({
        commissionLimit: limit,
        isBlocked: shouldBlock,
        blockedReason: shouldBlock
          ? "Commission due limit reached. Please clear your Athoo dues."
          : null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.params.id));

    const updated = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id),
    });
    await logAdminAction(req, "provider_commission_limit_updated", "user", req.params.id, { commissionLimit: limit });
    return res.json({ provider: toSafeUser(updated) });
  } catch (error) {
    logger.error({ err: error }, "admin commission limit error");
    return res.status(500).json({ error: "Failed to update commission limit" });
  }
});

router.post("/providers/:id/commission-payment", async (req: AuthRequest, res) => {
  try {
    const amount = Number((req.body as any).amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valid payment amount is required" });
    }

    const provider = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id),
    });
    if (!provider || provider.role !== "provider") {
      return res.status(404).json({ error: "Provider not found" });
    }

    const nextPending = Math.max(0, Number(provider.pendingCommission || 0) - amount);
    const shouldBlock =
      nextPending >=
      Number(provider.commissionLimit || DEFAULT_PLATFORM_SETTINGS.defaultCommissionLimit);

    await db
      .update(usersTable)
      .set({
        pendingCommission: nextPending,
        isBlocked: shouldBlock,
        blockedReason: shouldBlock
          ? "Commission due limit reached. Please clear your Athoo dues."
          : null,
        lastCommissionPaymentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, req.params.id));

    const updated = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id),
    });
    await logAdminAction(req, "provider_commission_payment_recorded", "user", req.params.id, { amount });
    return res.json({ provider: toSafeUser(updated) });
  } catch (error) {
    logger.error({ err: error }, "admin commission payment error");
    return res.status(500).json({ error: "Failed to record commission payment" });
  }
});

router.get("/bookings", async (req, res) => {
  try {
    const statusParam =
      typeof req.query.status === "string" && req.query.status.trim()
        ? req.query.status.trim()
        : undefined;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    let statusFilter;
    if (statusParam) {
      const statuses = statusParam.split(",").map(s => s.trim()).filter(Boolean);
      statusFilter = statuses.length === 1
        ? eq(bookingsTable.status, statuses[0])
        : inArray(bookingsTable.status, statuses);
    }

    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(statusFilter)
      .orderBy(desc(bookingsTable.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({ bookings, page, limit });
  } catch (error) {
    logger.error({ err: error }, "admin bookings error");
    return res.status(500).json({ error: "Failed to load bookings" });
  }
});

router.get("/settings", async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    return res.json({ settings });
  } catch (error) {
    logger.error({ err: error }, "admin settings error");
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

router.patch("/settings", async (req: AuthRequest, res) => {
  try {
    const settings = await savePlatformSettings(req.body || {});
    await logAdminAction(req, "platform_settings_updated", "settings", undefined, req.body as Record<string, unknown>);
    return res.json({ settings });
  } catch (error) {
    logger.error({ err: error }, "admin settings update error");
    return res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/broadcasts", async (_req, res) => {
  try {
    const broadcasts = await db
      .select()
      .from(adminBroadcastsTable)
      .orderBy(desc(adminBroadcastsTable.createdAt));

    return res.json({ broadcasts });
  } catch (error) {
    logger.error({ err: error }, "admin broadcasts error");
    return res.status(500).json({ error: "Failed to load broadcasts" });
  }
});

router.post("/broadcasts", async (req: AuthRequest, res) => {
  try {
    const { title, message, audience, targetUserIds } = req.body as {
      title?: string;
      message?: string;
      audience?: string;
      targetUserIds?: string[];
    };

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const adminUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });

    const normalizedUserIds = Array.isArray(targetUserIds)
      ? Array.from(new Set(targetUserIds.map((v) => String(v).trim()).filter(Boolean)))
      : [];

    const resolvedAudience = normalizedUserIds.length > 0 ? "specific" : (audience || "all");

    const broadcast = {
      id: generateId(),
      title: title.trim(),
      message: message.trim(),
      audience: resolvedAudience,
      createdBy: req.user!.userId,
      createdByName: adminUser?.name || "Admin",
      createdAt: new Date(),
    };

    await db.insert(adminBroadcastsTable).values(broadcast);

    // Persist as in-app notifications for the targeted audience.
    const targetUsers = normalizedUserIds.length > 0
      ? await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(sql`${usersTable.id} in (${sql.join(normalizedUserIds.map((id) => sql`${id}`), sql`, `)})`)
      : await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(
            broadcast.audience === "customers"
              ? eq(usersTable.role, "customer")
              : broadcast.audience === "providers"
                ? eq(usersTable.role, "provider")
                : undefined
          );

    if (targetUsers.length > 0) {
      await db.insert(notificationsTable).values(
        targetUsers.map((u) => ({
          id: generateId(),
          userId: u.id,
          title: broadcast.title,
          body: broadcast.message,
          type: "broadcast",
          data: { broadcastId: broadcast.id, audience: broadcast.audience },
        }))
      );
    }

    const tokens = normalizedUserIds.length > 0
      ? (await db
          .select({ token: usersTable.expoPushToken })
          .from(usersTable)
          .where(sql`${usersTable.id} in (${sql.join(normalizedUserIds.map((id) => sql`${id}`), sql`, `)})`))
          .map((r) => r.token)
          .filter(Boolean) as string[]
      : await getAudiencePushTokens(broadcast.audience);
    const pushResult = await sendExpoPushNotifications(tokens, {
      title: broadcast.title,
      body: broadcast.message,
      data: { type: "broadcast", audience: broadcast.audience },
    });

    await db
      .update(adminBroadcastsTable)
      .set({ sentCount: targetUsers.length })
      .where(eq(adminBroadcastsTable.id, broadcast.id));

    await logAdminAction(req, "broadcast_sent", "broadcast", broadcast.id, {
      audience: broadcast.audience,
      targetUserCount: targetUsers.length,
    });

    return res.json({
      broadcast: { ...broadcast, sentCount: targetUsers.length },
      pushResult,
    });
  } catch (error) {
    logger.error({ err: error }, "admin broadcast create error");
    return res.status(500).json({ error: "Failed to create broadcast" });
  }
});

router.patch("/users/:id/block", async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    await db.update(usersTable).set({
      isBlocked: true,
      blockedReason: reason || "Blocked by admin",
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_blocked", "user", req.params.id, { reason: reason || "Blocked by admin", userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to block user" });
  }
});

router.patch("/users/:id/unblock", async (req: AuthRequest, res) => {
  try {
    await db.update(usersTable).set({
      isBlocked: false,
      blockedReason: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_unblocked", "user", req.params.id, { userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to unblock user" });
  }
});

router.patch("/users/:id/verify", async (req: AuthRequest, res) => {
  try {
    const { isVerified } = req.body as { isVerified: boolean };
    const verified = Boolean(isVerified);
    await db.update(usersTable).set({
      isVerified: verified,
      verificationStatus: verified ? "approved" : "rejected",
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, verified ? "user_verified" : "user_unverified", "user", req.params.id, { userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update verification" });
  }
});

// Full verification status: pending | in_process | approved | rejected, with optional note
router.patch("/users/:id/verification-status", async (req: AuthRequest, res) => {
  try {
    const { status, note } = req.body as { status?: string; note?: string };
    const valid = ["pending", "in_process", "approved", "rejected"];
    if (!status || !valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
    }
    await db.update(usersTable).set({
      verificationStatus: status,
      verificationNote: note?.trim() || null,
      isVerified: status === "approved",
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));

    // Notify the provider in-app
    await db.insert(notificationsTable).values({
      id: generateId(),
      userId: req.params.id,
      title: status === "approved"
        ? "You're verified!"
        : status === "rejected"
          ? "Verification rejected"
          : "Verification update",
      body: status === "approved"
        ? "Your provider account has been approved. You can now receive jobs."
        : status === "rejected"
          ? (note?.trim() || "Your verification was rejected. Please review your documents and resubmit.")
          : (note?.trim() || `Your verification status is now: ${status.replace("_", " ")}`),
      type: "system",
      data: { verificationStatus: status },
    });

    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_verification_status_updated", "user", req.params.id, { status, note: note?.trim(), userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    logger.error({ err: e }, "verification status error");
    return res.status(500).json({ error: "Failed to update verification status" });
  }
});

// List documents for a given provider
router.get("/users/:id/documents", async (req, res) => {
  try {
    const docs = await db
      .select()
      .from(providerDocumentsTable)
      .where(eq(providerDocumentsTable.providerId, req.params.id))
      .orderBy(desc(providerDocumentsTable.createdAt));
    return res.json({ documents: docs });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load documents" });
  }
});

router.patch("/documents/:docId", async (req: AuthRequest, res) => {
  try {
    const { status, rejectionNote } = req.body as { status?: string; rejectionNote?: string };
    const valid = ["pending", "approved", "rejected"];
    if (!status || !valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
    }
    await db.update(providerDocumentsTable).set({
      status,
      rejectionNote: status === "rejected" ? (rejectionNote?.trim() || null) : null,
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(providerDocumentsTable.id, req.params.docId));
    const doc = await db.query.providerDocumentsTable.findFirst({
      where: eq(providerDocumentsTable.id, req.params.docId),
    });
    await logAdminAction(req, "document_reviewed", "provider_document", req.params.docId, { status, rejectionNote, docType: doc?.type });
    return res.json({ document: doc });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update document" });
  }
});

router.patch("/users/:id/deactivate", async (req: AuthRequest, res) => {
  try {
    await db.update(usersTable).set({
      isDeactivated: true,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_deactivated", "user", req.params.id, { userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to deactivate user" });
  }
});

router.patch("/users/:id/reactivate", async (req: AuthRequest, res) => {
  try {
    await db.update(usersTable).set({
      isDeactivated: false,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_reactivated", "user", req.params.id, { userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to reactivate user" });
  }
});

router.patch("/users/:id/profile", async (req: AuthRequest, res) => {
  try {
    const allowed = ["name", "email", "phone", "location", "bio", "ratePerHour"] as const;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of allowed) {
      if ((req.body as any)[k] !== undefined) patch[k] = (req.body as any)[k] || null;
    }
    if (Object.keys(patch).length === 1) return res.status(400).json({ error: "No valid fields" });
    await db.update(usersTable).set(patch).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_profile_updated", "user", req.params.id, { fields: Object.keys(patch).filter(k => k !== "updatedAt"), userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    logger.error({ err: e }, "admin user profile update error");
    return res.status(500).json({ error: "Failed to update user profile" });
  }
});

router.patch("/users/:id/notes", async (req: AuthRequest, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    await db.update(usersTable).set({
      adminNotes: notes || null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_notes_updated", "user", req.params.id, { userName: updated?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update notes" });
  }
});

router.patch("/users/:id/commission-limit", async (req: AuthRequest, res) => {
  try {
    const limit = Number((req.body as any).commissionLimit);
    if (!Number.isFinite(limit) || limit < 100) {
      return res.status(400).json({ error: "Valid commissionLimit required (min 100)" });
    }
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const shouldBlock = Number(user.pendingCommission || 0) >= limit;
    await db.update(usersTable).set({
      commissionLimit: limit,
      isBlocked: shouldBlock,
      blockedReason: shouldBlock ? "Commission due limit reached. Please clear your Athoo dues." : user.blockedReason,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_commission_limit_updated", "user", req.params.id, { commissionLimit: limit, userName: user.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update commission limit" });
  }
});

router.patch("/users/:id/mark-commission-paid", async (req: AuthRequest, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    const previousPending = user?.pendingCommission || 0;
    await db.update(usersTable).set({
      pendingCommission: 0,
      isBlocked: false,
      blockedReason: null,
      lastCommissionPaymentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.params.id));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    await logAdminAction(req, "user_commission_marked_paid", "user", req.params.id, { amountCleared: previousPending, userName: user?.name });
    return res.json({ user: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to mark commission paid" });
  }
});

router.get("/support", async (_req, res) => {
  try {
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .orderBy(desc(supportTicketsTable.createdAt))
      .limit(200);
    return res.json({ tickets });
  } catch (e) {
    logger.error({ err: e }, "admin support tickets error");
    return res.status(500).json({ error: "Failed to load support tickets" });
  }
});

router.patch("/support/:id/status", async (req: any, res) => {
  try {
    const { status, adminNotes, resolutionNote, priority } = req.body as { status?: string; adminNotes?: string; resolutionNote?: string; priority?: string };

    const update: Record<string, any> = { updatedAt: new Date() };

    if (status) {
      const validStatuses = ["open", "in_progress", "resolved", "closed"];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
      update.status = status;
      if (adminNotes !== undefined) update.adminNotes = adminNotes || null;
      if (resolutionNote) update.resolutionNote = resolutionNote;
      if (["resolved", "closed"].includes(status)) {
        update.resolvedBy = req.user?.userId || null;
        update.resolvedAt = new Date();
        if (resolutionNote) update.resolutionNote = resolutionNote;
      }
    }
    if (priority) {
      const validPriorities = ["urgent", "high", "normal", "low"];
      if (!validPriorities.includes(priority)) return res.status(400).json({ error: "Invalid priority" });
      update.priority = priority;
    }

    await db
      .update(supportTicketsTable)
      .set(update)
      .where(eq(supportTicketsTable.id, req.params.id));

    const ticket = await db.query.supportTicketsTable.findFirst({
      where: eq(supportTicketsTable.id, req.params.id),
    });

    if (ticket?.userId) {
      await notifyUser({
        userId: ticket.userId,
        title: status ? "Support Ticket Updated" : "Support Ticket Changed",
        body: status
          ? `Your support request "${ticket.subject}" is now ${String(status).replace(/_/g, " ")}.`
          : `Priority for your support request "${ticket.subject}" was updated.`,
        type: "system",
        data: { ticketId: ticket.id, status: ticket.status, priority: ticket.priority },
      });
    }

    await logAdminAction(req, "support_ticket_updated", "support_ticket", req.params.id, { status, priority });
    return res.json({ ticket });
  } catch (e) {
    logger.error({ err: e }, "admin support status error");
    return res.status(500).json({ error: "Failed to update ticket status" });
  }
});

// ─── Ticket Notes ──────────────────────────────────────────────────────────

router.get("/support/:id/notes", async (req, res) => {
  try {
    const notes = await db
      .select()
      .from(ticketNotesTable)
      .where(eq(ticketNotesTable.ticketId, req.params.id))
      .orderBy(desc(ticketNotesTable.createdAt));
    return res.json({ notes });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load ticket notes" });
  }
});

router.post("/support/:id/notes", async (req: AuthRequest, res) => {
  try {
    const { note, isInternal } = req.body as { note?: string; isInternal?: boolean };
    if (!note?.trim()) return res.status(400).json({ error: "Note is required" });

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });

    const internal = isInternal !== false;
    const newNote = {
      id: generateId(),
      ticketId: req.params.id,
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      note: note.trim(),
      isInternal: internal,
    };
    await db.insert(ticketNotesTable).values(newNote);

    if (!internal) {
      const ticket = await db.query.supportTicketsTable.findFirst({
        where: eq(supportTicketsTable.id, req.params.id),
      });
      if (ticket?.userId) {
        await notifyUser({
          userId: ticket.userId,
          title: "Support Team Replied",
          body: `New reply on your support request: "${ticket.subject}"`,
          type: "system",
          data: { ticketId: ticket.id },
        });
      }
    }

    await logAdminAction(req, "ticket_note_added", "support_ticket", req.params.id, { note: note.trim().slice(0, 100), isInternal: internal });
    return res.json({ note: newNote });
  } catch (e) {
    return res.status(500).json({ error: "Failed to add ticket note" });
  }
});

router.patch("/support/:id/assign", async (req: AuthRequest, res) => {
  try {
    const { assignedTo } = req.body as { assignedTo?: string | null };
    await db
      .update(supportTicketsTable)
      .set({ assignedTo: assignedTo || null, updatedAt: new Date() })
      .where(eq(supportTicketsTable.id, req.params.id));
    const ticket = await db.query.supportTicketsTable.findFirst({ where: eq(supportTicketsTable.id, req.params.id) });
    await logAdminAction(req, "support_ticket_assigned", "support_ticket", req.params.id, { assignedTo: assignedTo || null, subject: ticket?.subject });
    return res.json({ ticket });
  } catch (e) {
    return res.status(500).json({ error: "Failed to assign ticket" });
  }
});

// ─── Audit Log ─────────────────────────────────────────────────────────────

async function logAdminAction(
  req: AuthRequest,
  action: string,
  target?: string,
  targetId?: string,
  details?: Record<string, unknown>
) {
  try {
    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || req.user!.adminRole,
      action,
      target,
      targetId,
      details: details || null,
      ip: req.ip || req.socket?.remoteAddress || null,
    });
  } catch {
    // Non-critical — don't fail the request
  }
}

router.get("/audit-log", requirePermission("audit.read"), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const logs = await db
      .select()
      .from(auditLogTable)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit)
      .offset(offset);
    const total = await db.$count(auditLogTable);
    return res.json({ logs, total });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load audit log" });
  }
});

// ─── Login History ─────────────────────────────────────────────────────────

router.get("/login-history", requirePermission("audit.read"), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const successParam = req.query.success;

    let query = db.select().from(loginHistoryTable).$dynamic();
    if (successParam === "true") query = query.where(eq(loginHistoryTable.success, true));
    else if (successParam === "false") query = query.where(eq(loginHistoryTable.success, false));

    const [logs, totalResult] = await Promise.all([
      query.orderBy(desc(loginHistoryTable.createdAt)).limit(limit).offset(offset),
      db.$count(loginHistoryTable),
    ]);
    return res.json({ logs, total: totalResult, page, limit });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load login history" });
  }
});

// ─── Internal Notifications ─────────────────────────────────────────────────

router.get("/notifications", async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;
    const notifications = await db
      .select()
      .from(adminNotificationsTable)
      .where(
        or(
          eq(adminNotificationsTable.targetAdminId, adminId),
          sql`${adminNotificationsTable.targetAdminId} IS NULL`
        )
      )
      .orderBy(desc(adminNotificationsTable.createdAt))
      .limit(50);

    const withRead = notifications.map((n) => ({
      ...n,
      isRead: Array.isArray(n.readByAdminIds) ? n.readByAdminIds.includes(adminId) : false,
    }));

    return res.json({ notifications: withRead });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/notifications", requirePermission("notifications.write"), async (req: AuthRequest, res) => {
  try {
    const { title, message, type, link, targetAdminId } = req.body as {
      title?: string; message?: string; type?: string; link?: string; targetAdminId?: string;
    };
    if (!title?.trim() || !message?.trim()) return res.status(400).json({ error: "Title and message required" });

    const notif = {
      id: generateId(),
      title: title.trim(),
      message: message.trim(),
      type: type || "info",
      link: link || null,
      targetAdminId: targetAdminId || null,
      readByAdminIds: [] as string[],
    };
    await db.insert(adminNotificationsTable).values(notif);
    return res.json({ notification: notif });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create notification" });
  }
});

router.patch("/notifications/:id/read", async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;
    const notif = await db.query.adminNotificationsTable.findFirst({
      where: eq(adminNotificationsTable.id, req.params.id),
    });
    if (!notif) return res.status(404).json({ error: "Notification not found" });

    const reads = Array.isArray(notif.readByAdminIds) ? notif.readByAdminIds : [];
    if (!reads.includes(adminId)) {
      await db
        .update(adminNotificationsTable)
        .set({ readByAdminIds: [...reads, adminId] })
        .where(eq(adminNotificationsTable.id, req.params.id));
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to mark notification read" });
  }
});

router.patch("/notifications/read-all", async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;
    const notifications = await db
      .select()
      .from(adminNotificationsTable)
      .where(
        or(
          eq(adminNotificationsTable.targetAdminId, adminId),
          sql`${adminNotificationsTable.targetAdminId} IS NULL`
        )
      );

    for (const n of notifications) {
      const reads = Array.isArray(n.readByAdminIds) ? n.readByAdminIds : [];
      if (!reads.includes(adminId)) {
        await db
          .update(adminNotificationsTable)
          .set({ readByAdminIds: [...reads, adminId] })
          .where(eq(adminNotificationsTable.id, n.id));
      }
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to mark all read" });
  }
});

// ─── Admin User Management ──────────────────────────────────────────────────

router.get("/admin-users", requireSuperAdmin, async (_req, res) => {
  try {
    const admins = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .orderBy(desc(usersTable.joinedAt));
    return res.json({ admins: admins.map((a) => toSafeUser(a)) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load admin users" });
  }
});

router.post("/admin-users", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, phone, email, password, adminRole, adminPermissions } = req.body as Record<string, any>;
    if (!name?.trim() || !phone?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Name, phone, and password are required" });
    }

    const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, phone.trim()) });
    if (existing) return res.status(409).json({ error: "Phone already registered" });

    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.hash(password, 10);

    const newAdmin = {
      id: generateId(),
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      role: "admin" as const,
      password: hashed,
      adminRole: adminRole || null,
      adminPermissions: Array.isArray(adminPermissions) ? adminPermissions : [],
      isVerified: true,
      isAvailable: true,
    };

    await db.insert(usersTable).values(newAdmin);
    await logAdminAction(req, "admin_user_created", "admin_user", newAdmin.id, { name: newAdmin.name, adminRole: newAdmin.adminRole });
    return res.json({ admin: toSafeUser(newAdmin as any) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create admin user" });
  }
});

router.patch("/admin-users/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, email, adminRole, adminPermissions, password } = req.body as Record<string, any>;
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name?.trim()) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (adminRole !== undefined) updateData.adminRole = adminRole || null;
    if (Array.isArray(adminPermissions)) updateData.adminPermissions = adminPermissions;
    if (password?.trim()) {
      const bcrypt = await import("bcryptjs");
      updateData.password = await bcrypt.hash(password, 10);
    }

    await db.update(usersTable).set(updateData).where(and(eq(usersTable.id, req.params.id), eq(usersTable.role, "admin")));
    const updated = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.params.id) });
    if (!updated || updated.role !== "admin") return res.status(404).json({ error: "Admin not found" });

    await logAdminAction(req, "admin_user_updated", "admin_user", req.params.id, { adminRole: updateData.adminRole });
    return res.json({ admin: toSafeUser(updated) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update admin user" });
  }
});

router.delete("/admin-users/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (req.params.id === req.user!.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    const admin = await db.query.usersTable.findFirst({ where: and(eq(usersTable.id, req.params.id), eq(usersTable.role, "admin")) });
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
    await logAdminAction(req, "admin_user_deleted", "admin_user", req.params.id, { name: admin.name });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete admin user" });
  }
});

// ─── Reports ────────────────────────────────────────────────────────────────

router.get("/reports", requirePermission("reports.read"), async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();

    const [
      bookingsByStatus,
      bookingsByService,
      revenueByDay,
      newUsersByDay,
      topProviders,
      topServices,
    ] = await Promise.all([
      db
        .select({ status: bookingsTable.status, count: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(and(gte(bookingsTable.createdAt, from), lte(bookingsTable.createdAt, to)))
        .groupBy(bookingsTable.status),

      db
        .select({ service: bookingsTable.service, count: sql<number>`count(*)::int`, revenue: sql<number>`coalesce(sum(${bookingsTable.price}),0)::int` })
        .from(bookingsTable)
        .where(and(gte(bookingsTable.createdAt, from), lte(bookingsTable.createdAt, to)))
        .groupBy(bookingsTable.service)
        .orderBy(sql`count(*) desc`)
        .limit(10),

      db
        .select({
          day: sql<string>`to_char(${bookingsTable.createdAt}, 'YYYY-MM-DD')`,
          bookings: sql<number>`count(*)::int`,
          revenue: sql<number>`coalesce(sum(${bookingsTable.price}),0)::int`,
          commission: sql<number>`coalesce(sum(${bookingsTable.commissionAmount}),0)::int`,
        })
        .from(bookingsTable)
        .where(and(gte(bookingsTable.createdAt, from), lte(bookingsTable.createdAt, to)))
        .groupBy(sql`to_char(${bookingsTable.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${bookingsTable.createdAt}, 'YYYY-MM-DD')`),

      db
        .select({
          day: sql<string>`to_char(${usersTable.joinedAt}, 'YYYY-MM-DD')`,
          customers: sql<number>`count(*) filter (where ${usersTable.role} = 'customer')::int`,
          providers: sql<number>`count(*) filter (where ${usersTable.role} = 'provider')::int`,
        })
        .from(usersTable)
        .where(and(gte(usersTable.joinedAt, from), lte(usersTable.joinedAt, to)))
        .groupBy(sql`to_char(${usersTable.joinedAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${usersTable.joinedAt}, 'YYYY-MM-DD')`),

      db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          totalJobs: usersTable.totalJobs,
          rating: usersTable.rating,
          ratingCount: usersTable.ratingCount,
          pendingCommission: usersTable.pendingCommission,
          totalCommission: usersTable.totalCommission,
        })
        .from(usersTable)
        .where(eq(usersTable.role, "provider"))
        .orderBy(desc(usersTable.totalJobs))
        .limit(10),

      db
        .select({ service: bookingsTable.service, count: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(eq(bookingsTable.status, "completed"))
        .groupBy(bookingsTable.service)
        .orderBy(sql`count(*) desc`)
        .limit(8),
    ]);

    return res.json({
      bookingsByStatus,
      bookingsByService,
      revenueByDay,
      newUsersByDay,
      topProviders,
      topServices,
      period: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (e) {
    logger.error({ err: e }, "reports error");
    return res.status(500).json({ error: "Failed to generate reports" });
  }
});

// ─── CSV Export ─────────────────────────────────────────────────────────────

router.get("/export/:type", requirePermission("export.read"), async (req, res) => {
  try {
    const { type } = req.params;
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();

    let csv = "";
    let filename = `athoo-${type}-export.csv`;

    if (type === "users") {
      const rows = await db.select().from(usersTable).where(and(gte(usersTable.joinedAt, from), lte(usersTable.joinedAt, to))).orderBy(desc(usersTable.joinedAt));
      csv = "ID,Name,Phone,Email,Role,Verified,Blocked,Deactivated,TotalJobs,Rating,PendingCommission,TotalCommission,JoinedAt\n";
      csv += rows.map(r =>
        [r.id, `"${r.name}"`, r.phone, r.email || "", r.role, r.isVerified, r.isBlocked, r.isDeactivated, r.totalJobs, (r.rating || 0) / 10, r.pendingCommission, r.totalCommission, r.joinedAt?.toISOString() || ""].join(",")
      ).join("\n");
    } else if (type === "bookings") {
      const rows = await db.select().from(bookingsTable).where(and(gte(bookingsTable.createdAt, from), lte(bookingsTable.createdAt, to))).orderBy(desc(bookingsTable.createdAt));
      csv = "ID,CustomerName,CustomerPhone,ProviderName,ProviderPhone,Service,Status,Price,CommissionAmount,ProviderAmount,Address,ScheduledDate,ScheduledTime,Rating,CreatedAt\n";
      csv += rows.map(r =>
        [r.id, `"${r.customerName}"`, r.customerPhone, `"${r.providerName}"`, r.providerPhone, r.service, r.status, r.price || 0, r.commissionAmount || 0, r.providerAmount || 0, `"${r.address}"`, r.scheduledDate, r.scheduledTime, r.rating || "", r.createdAt?.toISOString() || ""].join(",")
      ).join("\n");
    } else if (type === "finance") {
      const rows = await db.select().from(usersTable).where(and(eq(usersTable.role, "provider"), gte(usersTable.joinedAt, from))).orderBy(desc(usersTable.pendingCommission));
      csv = "ProviderID,Name,Phone,PendingCommission,TotalCommission,CommissionLimit,Blocked,LastPaymentAt\n";
      csv += rows.map(r =>
        [r.id, `"${r.name}"`, r.phone, r.pendingCommission || 0, r.totalCommission || 0, r.commissionLimit || 0, r.isBlocked, r.lastCommissionPaymentAt?.toISOString() || ""].join(",")
      ).join("\n");
    } else if (type === "providers") {
      const rows = await db.select().from(usersTable).where(and(eq(usersTable.role, "provider"), gte(usersTable.joinedAt, from))).orderBy(desc(usersTable.totalJobs));
      csv = "ID,Name,Phone,Email,Location,Services,Rating,RatingCount,TotalJobs,IsVerified,IsAvailable,IsBlocked,JoinedAt\n";
      csv += rows.map(r =>
        [r.id, `"${r.name}"`, r.phone, r.email || "", `"${r.location || ""}"`, `"${(r.services || []).join("|")}"`, r.rating || 0, r.ratingCount, r.totalJobs, r.isVerified, r.isAvailable, r.isBlocked, r.joinedAt?.toISOString() || ""].join(",")
      ).join("\n");
    } else if (type === "support") {
      const rows = await db.select().from(supportTicketsTable).where(and(gte(supportTicketsTable.createdAt, from), lte(supportTicketsTable.createdAt, to))).orderBy(desc(supportTicketsTable.createdAt));
      csv = "ID,UserName,UserPhone,UserRole,Subject,Status,Priority,AssignedTo,ResolvedAt,CreatedAt\n";
      csv += rows.map(r =>
        [r.id, `"${r.userName}"`, r.userPhone, r.userRole, `"${r.subject}"`, r.status, r.priority, r.assignedTo || "", r.resolvedAt?.toISOString() || "", r.createdAt?.toISOString() || ""].join(",")
      ).join("\n");
    } else {
      return res.status(400).json({ error: "Invalid export type. Use: users, bookings, finance, providers, support" });
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    logger.error({ err: e }, "export error");
    return res.status(500).json({ error: "Failed to generate export" });
  }
});

// ─── Promotions ─────────────────────────────────────────────────────────────

router.get("/promotions", requirePermission("promotions.read"), async (_req, res) => {
  try {
    const promos = await db.select().from(promotionsTable).orderBy(desc(promotionsTable.createdAt));
    return res.json({ promotions: promos });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load promotions" });
  }
});

router.post("/promotions", requirePermission("promotions.write"), async (req: AuthRequest, res) => {
  try {
    const { code, description, discountType, discountValue, maxUses, minBookingValue, isActive, validFrom, validUntil } = req.body as Record<string, any>;
    if (!code?.trim() || !discountValue) return res.status(400).json({ error: "Code and discountValue are required" });

    const existing = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.code, code.trim().toUpperCase()) });
    if (existing) return res.status(409).json({ error: "Promo code already exists" });

    const promo = {
      id: generateId(),
      code: code.trim().toUpperCase(),
      description: description?.trim() || null,
      discountType: discountType || "percentage",
      discountValue: Number(discountValue),
      maxUses: maxUses ? Number(maxUses) : null,
      minBookingValue: minBookingValue ? Number(minBookingValue) : null,
      isActive: isActive !== false,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
      createdBy: req.user!.userId,
    };
    await db.insert(promotionsTable).values(promo);
    await logAdminAction(req, "promotion_created", "promotion", promo.id, { code: promo.code });
    return res.json({ promotion: promo });
  } catch (e) {
    return res.status(500).json({ error: "Failed to create promotion" });
  }
});

router.patch("/promotions/:id", requirePermission("promotions.write"), async (req: AuthRequest, res) => {
  try {
    const { description, discountValue, maxUses, minBookingValue, isActive, validFrom, validUntil } = req.body as Record<string, any>;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (description !== undefined) update.description = description?.trim() || null;
    if (discountValue !== undefined) update.discountValue = Number(discountValue);
    if (maxUses !== undefined) update.maxUses = maxUses ? Number(maxUses) : null;
    if (minBookingValue !== undefined) update.minBookingValue = minBookingValue ? Number(minBookingValue) : null;
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (validFrom !== undefined) update.validFrom = validFrom ? new Date(validFrom) : null;
    if (validUntil !== undefined) update.validUntil = validUntil ? new Date(validUntil) : null;

    await db.update(promotionsTable).set(update).where(eq(promotionsTable.id, req.params.id));
    const updated = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.id, req.params.id) });
    await logAdminAction(req, "promotion_updated", "promotion", req.params.id, update);
    return res.json({ promotion: updated });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update promotion" });
  }
});

router.delete("/promotions/:id", requirePermission("promotions.write"), async (req: AuthRequest, res) => {
  try {
    const promo = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.id, req.params.id) });
    await db.delete(promotionsTable).where(eq(promotionsTable.id, req.params.id));
    await logAdminAction(req, "promotion_deleted", "promotion", req.params.id, { code: promo?.code });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete promotion" });
  }
});

// Validate a promo code (public)
router.post("/promotions/validate", requireAuth, async (req, res) => {
  try {
    const { code, bookingValue } = req.body as { code?: string; bookingValue?: number };
    if (!code?.trim()) return res.status(400).json({ error: "Code required" });

    const promo = await db.query.promotionsTable.findFirst({ where: eq(promotionsTable.code, code.trim().toUpperCase()) });
    if (!promo || !promo.isActive) return res.status(404).json({ error: "Invalid or inactive promo code" });
    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) return res.status(400).json({ error: "Promo code is not yet valid" });
    if (promo.validUntil && promo.validUntil < now) return res.status(400).json({ error: "Promo code has expired" });
    if (promo.maxUses && (promo.usedCount || 0) >= promo.maxUses) return res.status(400).json({ error: "Promo code has reached its usage limit" });
    if (bookingValue && promo.minBookingValue && bookingValue < promo.minBookingValue) return res.status(400).json({ error: `Minimum booking value is Rs. ${promo.minBookingValue}` });

    const discountAmount = promo.discountType === "percentage"
      ? Math.round((bookingValue || 0) * promo.discountValue / 100)
      : promo.discountValue;

    return res.json({ valid: true, promotion: promo, discountAmount });
  } catch (e) {
    return res.status(500).json({ error: "Failed to validate promo code" });
  }
});

// ── Broadcast Push Notification ───────────────────────────────────────────────
router.post("/broadcast-push", requirePermission("notifications.write"), async (req: AuthRequest, res) => {
  try {
    const { title, body, audience } = req.body as { title: string; body: string; audience: string };
    if (!title || !body) return res.status(400).json({ error: "title and body are required" });

    const validAudiences = ["all", "customers", "providers"];
    const aud = validAudiences.includes(audience) ? audience : "all";

    const tokens = await getAudiencePushTokens(aud);
    if (tokens.length === 0) return res.json({ sent: 0, message: "No registered push tokens for this audience" });

    const result = await sendExpoPushNotifications(tokens, { title, body, data: { type: "broadcast" } });

    await db.insert(adminBroadcastsTable).values({
      id: generateId(),
      title,
      message: body,
      audience: aud,
      createdBy: req.user!.userId,
      sentCount: result.sent || 0,
      createdAt: new Date(),
    }).catch(() => undefined); // non-fatal

    return res.json({ sent: result.sent, audience: aud, tokenCount: tokens.length });
  } catch (e) {
    logger.error({ err: e }, "admin broadcast push error");
    return res.status(500).json({ error: "Failed to send broadcast" });
  }
});

router.get("/broadcast-push/history", async (_req, res) => {
  try {
    const history = await db.select().from(adminBroadcastsTable).orderBy(desc(adminBroadcastsTable.createdAt)).limit(50);
    return res.json({ history });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load broadcast history" });
  }
});

// ─── Sidebar Counts ──────────────────────────────────────────────────────────

router.get("/sidebar-counts", async (req: AuthRequest, res) => {
  try {
    const adminId = req.user!.userId;

    const [
      pendingVerifications,
      pendingCommissionPayments,
      pendingWithdrawals,
      pendingRefunds,
      openSupportTickets,
      pendingRateRequests,
    ] = await Promise.all([
      db.$count(usersTable, and(eq(usersTable.role, "provider"), eq(usersTable.verificationStatus, "pending"))),
      db.$count(commissionPaymentsTable, eq(commissionPaymentsTable.status, "pending")),
      db.$count(withdrawalRequestsTable, eq(withdrawalRequestsTable.status, "pending")),
      db.$count(refundRequestsTable, eq(refundRequestsTable.status, "pending")),
      db.$count(supportTicketsTable, eq(supportTicketsTable.status, "open")),
      db.$count(hourlyRateRequestsTable, eq(hourlyRateRequestsTable.status, "pending")),
    ]);

    // Count unread notifications for this admin
    const notifications = await db
      .select()
      .from(adminNotificationsTable)
      .where(
        or(
          eq(adminNotificationsTable.targetAdminId, adminId),
          sql`${adminNotificationsTable.targetAdminId} IS NULL`
        )
      )
      .limit(100);

    const unreadNotifications = notifications.filter(
      (n) => !(Array.isArray(n.readByAdminIds) && n.readByAdminIds.includes(adminId))
    ).length;

    return res.json({
      counts: {
        pendingVerifications,
        pendingCommissionPayments,
        pendingWithdrawals,
        pendingRefunds,
        openSupportTickets,
        pendingRateRequests,
        unreadNotifications,
      },
    });
  } catch (e) {
    logger.error({ err: e }, "sidebar counts error");
    return res.status(500).json({ error: "Failed to load sidebar counts" });
  }
});

// ─── Admin Blacklist ──────────────────────────────────────────────────────────

router.get("/blacklist", async (_req, res) => {
  try {
    const entries = await db
      .select({
        id: adminBlacklistTable.id,
        type: adminBlacklistTable.type,
        value: adminBlacklistTable.value,
        reason: adminBlacklistTable.reason,
        addedBy: adminBlacklistTable.addedBy,
        isActive: adminBlacklistTable.isActive,
        createdAt: adminBlacklistTable.createdAt,
        addedByName: usersTable.name,
      })
      .from(adminBlacklistTable)
      .leftJoin(usersTable, eq(adminBlacklistTable.addedBy, usersTable.id))
      .orderBy(desc(adminBlacklistTable.createdAt));
    return res.json({ entries });
  } catch (e) {
    logger.error({ err: e }, "blacklist fetch error");
    return res.status(500).json({ error: "Failed to load blacklist" });
  }
});

router.post("/blacklist", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { type, value, reason } = req.body as { type: string; value: string; reason?: string };
    if (!type || !value?.trim()) {
      return res.status(400).json({ error: "type and value are required" });
    }
    if (!["phone", "email"].includes(type)) {
      return res.status(400).json({ error: "type must be 'phone' or 'email'" });
    }

    const entry = {
      id: generateId(),
      type,
      value: value.trim().toLowerCase(),
      reason: reason?.trim() || null,
      addedBy: req.user!.userId,
      isActive: true,
    };
    await db.insert(adminBlacklistTable).values(entry);
    await logAdminAction(req, "blacklist_add", "blacklist", entry.id, { type, value: entry.value });
    return res.json({ entry });
  } catch (e) {
    logger.error({ err: e }, "blacklist add error");
    return res.status(500).json({ error: "Failed to add to blacklist" });
  }
});

router.patch("/blacklist/:id/toggle", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const entry = await db.query.adminBlacklistTable.findFirst({
      where: eq(adminBlacklistTable.id, req.params.id),
    });
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    await db
      .update(adminBlacklistTable)
      .set({ isActive: !entry.isActive })
      .where(eq(adminBlacklistTable.id, req.params.id));

    await logAdminAction(req, entry.isActive ? "blacklist_disable" : "blacklist_enable", "blacklist", entry.id);
    return res.json({ success: true, isActive: !entry.isActive });
  } catch (e) {
    logger.error({ err: e }, "blacklist toggle error");
    return res.status(500).json({ error: "Failed to toggle blacklist entry" });
  }
});

router.delete("/blacklist/:id", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    await db.delete(adminBlacklistTable).where(eq(adminBlacklistTable.id, req.params.id));
    await logAdminAction(req, "blacklist_remove", "blacklist", req.params.id);
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "blacklist delete error");
    return res.status(500).json({ error: "Failed to remove blacklist entry" });
  }
});

export default router;

