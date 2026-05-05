import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  userSubscriptionsTable,
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

async function getAdminName(userId: string): Promise<string> {
  try {
    const row = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    return row?.name || userId;
  } catch {
    return userId;
  }
}

const router = Router();
const id = () => crypto.randomUUID();

// PUBLIC — list plans (logged-out users may also browse pricing)
router.get("/plans", async (_req, res) => {
  const rows = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isActive, true))
    .orderBy(asc(subscriptionPlansTable.sortOrder), asc(subscriptionPlansTable.priceMonthly));
  return res.json({ plans: rows });
});

router.use(requireAuth);

// MY current subscription
router.get("/me", async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(userSubscriptionsTable)
    .where(eq(userSubscriptionsTable.userId, req.user!.userId))
    .orderBy(desc(userSubscriptionsTable.createdAt));
  const active = rows.find((r) => r.status === "active") ?? null;
  return res.json({ active, history: rows });
});

// SUBSCRIBE — creates a pending payment row, admin approves to activate
router.post("/subscribe", async (req: AuthRequest, res) => {
  try {
    const { planId, billingPeriod, paymentReference, screenshotUrl } = req.body ?? {};
    const plan = await db.query.subscriptionPlansTable.findFirst({
      where: eq(subscriptionPlansTable.id, String(planId ?? "")),
    });
    if (!plan || !plan.isActive) return res.status(404).json({ error: "Plan not found" });
    const period = billingPeriod === "yearly" ? "yearly" : "monthly";
    const amount = period === "yearly" ? plan.priceYearly ?? 0 : plan.priceMonthly ?? 0;
    const newId = id();
    await db.insert(userSubscriptionsTable).values({
      id: newId,
      userId: req.user!.userId,
      planId: plan.id,
      billingPeriod: period,
      status: "pending",
      amount,
      paymentReference: paymentReference ? String(paymentReference) : null,
      screenshotUrl: screenshotUrl ? String(screenshotUrl) : null,
    });
    await db.insert(adminNotificationsTable).values({
      id: id(),
      title: "New subscription payment",
      message: `User submitted a ${period} payment for plan "${plan.name}"`,
      type: "info",
      link: `/admin/subscriptions/${newId}`,
    });
    return res.status(201).json({ subscriptionId: newId });
  } catch (e) {
    logger.error({ err: e }, "subscriptions.subscribe error");
    return res.status(500).json({ error: "Failed to subscribe" });
  }
});

router.post("/cancel", async (req: AuthRequest, res) => {
  await db
    .update(userSubscriptionsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(userSubscriptionsTable.userId, req.user!.userId),
        eq(userSubscriptionsTable.status, "active"),
      ),
    );
  await db
    .update(usersTable)
    .set({ isPremium: false, premiumPlanId: null, premiumExpiresAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user!.userId));
  return res.json({ success: true });
});

// ADMIN sub-router
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/plans", async (_req, res) => {
  const rows = await db
    .select()
    .from(subscriptionPlansTable)
    .orderBy(asc(subscriptionPlansTable.sortOrder), asc(subscriptionPlansTable.priceMonthly));
  return res.json({ plans: rows });
});

adminRouter.post("/plans", async (req: AuthRequest, res) => {
  try {
    const { name, description, audience, priceMonthly, priceYearly, features, isActive, sortOrder } =
      req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name required" });
    }
    const newId = id();
    await db.insert(subscriptionPlansTable).values({
      id: newId,
      name: name.trim(),
      description: description ? String(description) : null,
      audience: audience === "customer" || audience === "both" ? audience : "provider",
      priceMonthly: Number(priceMonthly) || 0,
      priceYearly: Number(priceYearly) || 0,
      features: Array.isArray(features) ? features.map(String) : [],
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
    });
    const adminDisplayName = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName,
      action: "plan.create",
      target: "subscription_plan",
      targetId: newId,
      ip: req.ip ?? null,
    });
    const row = await db.query.subscriptionPlansTable.findFirst({
      where: eq(subscriptionPlansTable.id, newId),
    });
    return res.status(201).json({ plan: row });
  } catch (e) {
    logger.error({ err: e }, "subscriptions.plan.create error");
    return res.status(500).json({ error: "Failed to create plan" });
  }
});

adminRouter.patch("/plans/:id", async (req: AuthRequest, res) => {
  try {
    const plan = await db.query.subscriptionPlansTable.findFirst({
      where: eq(subscriptionPlansTable.id, req.params.id),
    });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const { name, description, audience, priceMonthly, priceYearly, features, isActive, sortOrder } =
      req.body ?? {};
    if (typeof name === "string" && name.trim()) patch.name = name.trim();
    if (typeof description === "string") patch.description = description;
    if (audience === "provider" || audience === "customer" || audience === "both") patch.audience = audience;
    if (Number.isFinite(Number(priceMonthly))) patch.priceMonthly = Number(priceMonthly);
    if (Number.isFinite(Number(priceYearly))) patch.priceYearly = Number(priceYearly);
    if (Array.isArray(features)) patch.features = features.map(String);
    if (typeof isActive === "boolean") patch.isActive = isActive;
    if (Number.isFinite(Number(sortOrder))) patch.sortOrder = Number(sortOrder);
    await db.update(subscriptionPlansTable).set(patch).where(eq(subscriptionPlansTable.id, plan.id));
    const row = await db.query.subscriptionPlansTable.findFirst({
      where: eq(subscriptionPlansTable.id, plan.id),
    });
    return res.json({ plan: row });
  } catch (e) {
    logger.error({ err: e }, "subscriptions.plan.update error");
    return res.status(500).json({ error: "Failed to update plan" });
  }
});

adminRouter.delete("/plans/:id", async (req: AuthRequest, res) => {
  await db
    .update(subscriptionPlansTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(subscriptionPlansTable.id, req.params.id));
  return res.json({ success: true });
});

// Subscription review
adminRouter.get("/", async (req, res) => {
  const status = String(req.query.status ?? "");
  const where = status ? eq(userSubscriptionsTable.status, status) : undefined;
  const rows = await db
    .select()
    .from(userSubscriptionsTable)
    .where(where as any)
    .orderBy(desc(userSubscriptionsTable.createdAt))
    .limit(200);
  return res.json({ subscriptions: rows });
});

adminRouter.post("/:id/approve", async (req: AuthRequest, res) => {
  try {
    const sub = await db.query.userSubscriptionsTable.findFirst({
      where: eq(userSubscriptionsTable.id, req.params.id),
    });
    if (!sub) return res.status(404).json({ error: "Subscription not found" });
    if (sub.status === "active") return res.json({ subscription: sub });
    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() +
        (sub.billingPeriod === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
    );
    await db.transaction(async (tx) => {
      await tx
        .update(userSubscriptionsTable)
        .set({
          status: "active",
          startedAt,
          expiresAt,
          reviewedBy: req.user!.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userSubscriptionsTable.id, sub.id));
      await tx
        .update(usersTable)
        .set({
          isPremium: true,
          premiumPlanId: sub.planId,
          premiumExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, sub.userId));
      await tx.insert(notificationsTable).values({
        id: id(),
        userId: sub.userId,
        title: "Premium activated",
        body: "Your premium subscription is now active.",
        type: "system",
      });
    });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "subscriptions.approve error");
    return res.status(500).json({ error: "Failed to approve" });
  }
});

adminRouter.post("/:id/reject", async (req: AuthRequest, res) => {
  const reason = String(req.body?.reason ?? "").trim();
  const sub = await db.query.userSubscriptionsTable.findFirst({
    where: eq(userSubscriptionsTable.id, req.params.id),
  });
  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  await db
    .update(userSubscriptionsTable)
    .set({
      status: "expired",
      rejectionNote: reason || null,
      reviewedBy: req.user!.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(userSubscriptionsTable.id, sub.id));
  await db.insert(notificationsTable).values({
    id: id(),
    userId: sub.userId,
    title: "Subscription rejected",
    body: reason || "Your subscription payment could not be verified.",
    type: "system",
  });
  return res.json({ success: true });
});

export { adminRouter as subscriptionsAdminRouter };
export default router;

export async function seedSubscriptionPlansIfEmpty() {
  try {
    const existing = await db.select().from(subscriptionPlansTable).limit(1);
    if (existing.length > 0) return;
    await db.insert(subscriptionPlansTable).values([
      {
        id: crypto.randomUUID(),
        name: "Customer Basic",
        description: "Perfect for occasional home service bookings",
        audience: "customer",
        priceMonthly: 299,
        priceYearly: 2990,
        features: ["Priority booking", "Free cancellation (2x/month)", "Dedicated support", "Rs. 200 discount per visit"],
        isActive: true,
        sortOrder: 1,
      },
      {
        id: crypto.randomUUID(),
        name: "Customer Premium",
        description: "Best value for regular home service users",
        audience: "customer",
        priceMonthly: 599,
        priceYearly: 5990,
        features: ["Priority booking", "Free cancellation (unlimited)", "VIP support", "Rs. 500 discount per visit", "Exclusive deals", "Home manager dashboard"],
        isActive: true,
        sortOrder: 2,
      },
      {
        id: crypto.randomUUID(),
        name: "Provider Starter",
        description: "Start receiving more orders",
        audience: "provider",
        priceMonthly: 499,
        priceYearly: 4990,
        features: ["Featured listing", "Priority leads", "Rs. 5,000/month commission limit", "Profile badge"],
        isActive: true,
        sortOrder: 3,
      },
      {
        id: crypto.randomUUID(),
        name: "Provider Pro",
        description: "Grow your business with maximum visibility",
        audience: "provider",
        priceMonthly: 999,
        priceYearly: 9990,
        features: ["Top-of-search listing", "Unlimited priority leads", "Rs. 10,000/month commission limit", "⭐ Premium badge", "Analytics dashboard", "Dedicated account manager"],
        isActive: true,
        sortOrder: 4,
      },
    ]);
  } catch {
    // non-fatal
  }
}

