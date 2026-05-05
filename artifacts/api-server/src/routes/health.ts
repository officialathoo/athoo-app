import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Deep health: pings the database. Use for production monitoring / load balancer.
router.get("/healthz/deep", async (_req, res) => {
  const startedAt = Date.now();
  try {
    const result = await db.execute(sql`SELECT 1 AS ok`);
    const dbMs = Date.now() - startedAt;
    res.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: { ok: true, latencyMs: dbMs, rows: result.rows?.length ?? 0 } },
    });
  } catch (e) {
    res.status(503).json({
      status: "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: { ok: false, error: (e as Error).message } },
    });
  }
});

export default router;

