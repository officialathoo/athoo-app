import { Router } from "express";
import { db } from "@workspace/db";
import { serviceAreasTable } from "@workspace/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

function genId() { return crypto.randomUUID(); }

export const serviceAreasPublicRouter = Router();
export const serviceAreasAdminRouter = Router();

// Public: list active service areas
serviceAreasPublicRouter.get("/", async (_req, res) => {
  try {
    const areas = await db
      .select()
      .from(serviceAreasTable)
      .where(eq(serviceAreasTable.isActive, true))
      .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
    return res.json({ areas });
  } catch (e) {
    logger.error({ err: e }, "service-areas list error");
    return res.status(500).json({ error: "Failed to load service areas" });
  }
});

// Admin CRUD
serviceAreasAdminRouter.use(requireAuth, requireAdmin);

serviceAreasAdminRouter.get("/", async (_req, res) => {
  try {
    const areas = await db
      .select()
      .from(serviceAreasTable)
      .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
    return res.json({ areas });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load service areas" });
  }
});

serviceAreasAdminRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const { name, province, isActive, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const area = {
      id: genId(),
      name: String(name).trim(),
      province: province || null,
      isActive: isActive !== false,
      sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(serviceAreasTable).values(area);
    return res.status(201).json({ area });
  } catch (e) {
    logger.error({ err: e }, "service-areas create error");
    return res.status(500).json({ error: "Failed to create service area" });
  }
});

serviceAreasAdminRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as { id: string };
    const { name, province, isActive, sortOrder } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name).trim();
    if (province !== undefined) updates.province = province;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
    await db.update(serviceAreasTable).set(updates).where(eq(serviceAreasTable.id, id));
    const area = await db.query.serviceAreasTable.findFirst({ where: eq(serviceAreasTable.id, id) });
    return res.json({ area });
  } catch (e) {
    return res.status(500).json({ error: "Failed to update service area" });
  }
});

serviceAreasAdminRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as { id: string };
    await db.delete(serviceAreasTable).where(eq(serviceAreasTable.id, id));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete service area" });
  }
});

// Seed default areas if empty
export async function seedServiceAreasIfEmpty() {
  try {
    const existing = await db.select().from(serviceAreasTable).limit(1);
    if (existing.length > 0) return;
    const defaults = [
      { name: "Islamabad", province: "Islamabad Capital Territory", sortOrder: 0 },
      { name: "Rawalpindi", province: "Punjab", sortOrder: 1 },
      { name: "Lahore", province: "Punjab", sortOrder: 2 },
      { name: "Karachi", province: "Sindh", sortOrder: 3 },
      { name: "Faisalabad", province: "Punjab", sortOrder: 4 },
      { name: "Peshawar", province: "Khyber Pakhtunkhwa", sortOrder: 5 },
      { name: "Quetta", province: "Balochistan", sortOrder: 6 },
      { name: "Multan", province: "Punjab", sortOrder: 7 },
    ];
    await db.insert(serviceAreasTable).values(
      defaults.map((d) => ({ id: genId(), ...d, isActive: true, createdAt: new Date(), updatedAt: new Date() }))
    );
    logger.info("Seeded default service areas");
  } catch (e) {
    logger.error({ err: e }, "Failed to seed service areas");
  }
}
