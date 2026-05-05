import { Router } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { db } from "@workspace/db";
import { serviceCategoriesTable, auditLogTable, usersTable } from "@workspace/db/schema";
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
const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

// PUBLIC — list active categories (used by both customer & provider apps)
router.get("/", async (req, res) => {
  try {
    const all = req.query.all === "true";
    const where = all ? undefined : eq(serviceCategoriesTable.isActive, true);
    const rows = await db
      .select()
      .from(serviceCategoriesTable)
      .where(where as any)
      .orderBy(asc(serviceCategoriesTable.sortOrder), asc(serviceCategoriesTable.name));
    return res.json({ categories: rows });
  } catch (e) {
    logger.error({ err: e }, "categories.list error");
    return res.status(500).json({ error: "Failed to load categories" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const row = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.slug, req.params.slug),
    });
    if (!row) return res.status(404).json({ error: "Category not found" });
    return res.json({ category: row });
  } catch (e) {
    logger.error({ err: e }, "categories.get error");
    return res.status(500).json({ error: "Failed to load category" });
  }
});

// ADMIN — full CRUD
const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(serviceCategoriesTable)
    .orderBy(asc(serviceCategoriesTable.sortOrder), asc(serviceCategoriesTable.name));
  return res.json({ categories: rows });
});

adminRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const {
      name,
      slug,
      icon,
      color,
      visitCharge,
      description,
      isActive,
      sortOrder,
    } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Name is required" });
    }
    const finalSlug = slugify(slug || name);
    const existing = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.slug, finalSlug),
    });
    if (existing) {
      return res.status(409).json({ error: "A category with this slug already exists" });
    }
    const newId = id();
    await db.insert(serviceCategoriesTable).values({
      id: newId,
      name: name.trim(),
      slug: finalSlug,
      icon: typeof icon === "string" ? icon : "tool",
      color: typeof color === "string" ? color : "#1A6EE0",
      visitCharge: Number.isFinite(Number(visitCharge)) ? Number(visitCharge) : 0,
      description: typeof description === "string" ? description : null,
      isActive: isActive !== false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      createdBy: req.user?.userId,
    });
    const adminDisplayName = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName,
      action: "category.create",
      target: "service_category",
      targetId: newId,
      details: { name, slug: finalSlug },
      ip: req.ip ?? null,
    });
    const row = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.id, newId),
    });
    return res.status(201).json({ category: row });
  } catch (e) {
    logger.error({ err: e }, "categories.create error");
    return res.status(500).json({ error: "Failed to create category" });
  }
});

adminRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const cat = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.id, req.params.id),
    });
    if (!cat) return res.status(404).json({ error: "Category not found" });
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const { name, slug, icon, color, visitCharge, description, isActive, sortOrder } = req.body ?? {};
    if (typeof name === "string" && name.trim()) patch.name = name.trim();
    if (typeof slug === "string" && slug.trim()) patch.slug = slugify(slug);
    if (typeof icon === "string") patch.icon = icon;
    if (typeof color === "string") patch.color = color;
    if (typeof description === "string") patch.description = description;
    if (Number.isFinite(Number(visitCharge))) patch.visitCharge = Number(visitCharge);
    if (Number.isFinite(Number(sortOrder))) patch.sortOrder = Number(sortOrder);
    if (typeof isActive === "boolean") patch.isActive = isActive;
    await db.update(serviceCategoriesTable).set(patch).where(eq(serviceCategoriesTable.id, cat.id));
    const adminDisplayName2 = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName2,
      action: "category.update",
      target: "service_category",
      targetId: cat.id,
      details: patch as object,
      ip: req.ip ?? null,
    });
    const row = await db.query.serviceCategoriesTable.findFirst({
      where: eq(serviceCategoriesTable.id, cat.id),
    });
    return res.json({ category: row });
  } catch (e) {
    logger.error({ err: e }, "categories.update error");
    return res.status(500).json({ error: "Failed to update category" });
  }
});

adminRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    await db
      .update(serviceCategoriesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(serviceCategoriesTable.id, req.params.id));
    const adminDisplayName3 = await getAdminName(req.user!.userId);
    await db.insert(auditLogTable).values({
      id: id(),
      adminId: req.user!.userId,
      adminName: adminDisplayName3,
      action: "category.deactivate",
      target: "service_category",
      targetId: req.params.id,
      ip: req.ip ?? null,
    });
    return res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "categories.delete error");
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

export { adminRouter as categoriesAdminRouter };
export default router;

