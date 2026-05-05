import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { hourlyRateRequestsTable, usersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import crypto from "crypto";

function generateId(): string { return crypto.randomUUID(); }

const providerRouter = Router();
const adminRouter = Router();

// POST /me/rate-requests — provider requests a rate change
providerRouter.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== "provider") {
      return res.status(403).json({ error: "Only providers can request rate changes" });
    }
    const { service, currentRate, requestedRate, reason } = req.body as Record<string, any>;
    if (!service?.trim() || !requestedRate) {
      return res.status(400).json({ error: "Service and requestedRate are required" });
    }
    if (Number(requestedRate) < 100 || Number(requestedRate) > 50000) {
      return res.status(400).json({ error: "Rate must be between Rs. 100 and Rs. 50,000 per hour" });
    }

    const provider = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });

    const rateRequest = {
      id: generateId(),
      providerId: req.user!.userId,
      providerName: provider?.name || (req.user as any).name || "Unknown",
      service: service.trim(),
      currentRate: currentRate ? Number(currentRate) : null,
      requestedRate: Number(requestedRate),
      reason: reason?.trim() || null,
      status: "pending",
    };
    await db.insert(hourlyRateRequestsTable).values(rateRequest);
    return res.status(201).json({ rateRequest });
  } catch (e) {
    logger.error({ err: e }, "rate-request create error");
    return res.status(500).json({ error: "Failed to submit rate change request" });
  }
});

// GET /me/rate-requests — provider's own requests
providerRouter.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const requests = await db
      .select()
      .from(hourlyRateRequestsTable)
      .where(eq(hourlyRateRequestsTable.providerId, req.user!.userId))
      .orderBy(desc(hourlyRateRequestsTable.createdAt));
    return res.json({ requests });
  } catch {
    return res.status(500).json({ error: "Failed to load rate requests" });
  }
});

// Admin routes
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/", async (_req, res: Response) => {
  try {
    const requests = await db
      .select()
      .from(hourlyRateRequestsTable)
      .orderBy(desc(hourlyRateRequestsTable.createdAt));
    return res.json({ requests });
  } catch {
    return res.status(500).json({ error: "Failed to load rate requests" });
  }
});

adminRouter.patch("/:id", requirePermission("providers.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { status, reviewNote } = req.body as Record<string, any>;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be approved or rejected" });
    }

    const rateRequest = await db.query.hourlyRateRequestsTable.findFirst({
      where: eq(hourlyRateRequestsTable.id, req.params.id as string),
    });
    if (!rateRequest) return res.status(404).json({ error: "Rate request not found" });

    await db.update(hourlyRateRequestsTable).set({
      status,
      reviewedBy: req.user!.userId,
      reviewNote: reviewNote?.trim() || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(hourlyRateRequestsTable.id, req.params.id as string));

    const updated = await db.query.hourlyRateRequestsTable.findFirst({
      where: eq(hourlyRateRequestsTable.id, req.params.id as string),
    });
    return res.json({ rateRequest: updated });
  } catch (e) {
    logger.error({ err: e }, "rate-request review error");
    return res.status(500).json({ error: "Failed to review rate request" });
  }
});

export { providerRouter as rateRequestsProviderRouter, adminRouter as rateRequestsAdminRouter };
export default providerRouter;
