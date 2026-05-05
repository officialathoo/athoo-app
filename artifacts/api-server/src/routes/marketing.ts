import { Router } from "express";
import { db } from "@workspace/db";
import {
  marketingBannersTable,
  appAnnouncementsTable,
  faqsTable,
  serviceAreasTable,
  auditLogTable,
  usersTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte, isNull, or } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { generateId } from "../lib/admin";
import { logger } from "../lib/logger";

const publicRouter = Router();
const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

// ── PUBLIC: GET /api/marketing/banners ────────────────────────────────────────
// Returns active banners for all or specific audience (customer/provider)
publicRouter.get("/banners", async (req, res) => {
  try {
    const audience = (req.query.audience as string) || "customer";
    const now = new Date();

    const banners = await db
      .select()
      .from(marketingBannersTable)
      .where(
        and(
          eq(marketingBannersTable.isActive, true),
          or(
            eq(marketingBannersTable.targetAudience, "all"),
            eq(marketingBannersTable.targetAudience, audience)
          ),
          or(
            isNull(marketingBannersTable.expiresAt),
            gte(marketingBannersTable.expiresAt, now)
          )
        )
      )
      .orderBy(asc(marketingBannersTable.sortOrder), desc(marketingBannersTable.createdAt));

    return res.json({ banners });
  } catch (err) {
    logger.error({ err }, "get banners error");
    return res.status(500).json({ error: "Failed to load banners" });
  }
});

// ── PUBLIC: GET /api/marketing/announcements ──────────────────────────────────
publicRouter.get("/announcements", async (req, res) => {
  try {
    const audience = (req.query.audience as string) || "customer";
    const now = new Date();

    const announcements = await db
      .select()
      .from(appAnnouncementsTable)
      .where(
        and(
          eq(appAnnouncementsTable.isActive, true),
          or(
            eq(appAnnouncementsTable.targetAudience, "all"),
            eq(appAnnouncementsTable.targetAudience, audience)
          ),
          or(
            isNull(appAnnouncementsTable.expiresAt),
            gte(appAnnouncementsTable.expiresAt, now)
          )
        )
      )
      .orderBy(desc(appAnnouncementsTable.priority), desc(appAnnouncementsTable.createdAt));

    return res.json({ announcements });
  } catch (err) {
    logger.error({ err }, "get announcements error");
    return res.status(500).json({ error: "Failed to load announcements" });
  }
});

// ── PUBLIC: GET /api/faqs ─────────────────────────────────────────────────────
publicRouter.get("/faqs", async (req, res) => {
  try {
    const audience = (req.query.audience as string) || "customer";

    const faqs = await db
      .select()
      .from(faqsTable)
      .where(
        and(
          eq(faqsTable.isActive, true),
          or(
            eq(faqsTable.targetAudience, "all"),
            eq(faqsTable.targetAudience, audience)
          )
        )
      )
      .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));

    return res.json({ faqs });
  } catch (err) {
    logger.error({ err }, "get faqs error");
    return res.status(500).json({ error: "Failed to load FAQs" });
  }
});

// ── PUBLIC: GET /api/marketing/areas ─────────────────────────────────────────
publicRouter.get("/areas", async (_req, res) => {
  try {
    const areas = await db
      .select()
      .from(serviceAreasTable)
      .where(eq(serviceAreasTable.isActive, true))
      .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
    return res.json({ areas });
  } catch (err) {
    logger.error({ err }, "get areas error");
    return res.status(500).json({ error: "Failed to load service areas" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Banners CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/banners", async (_req, res) => {
  try {
    const banners = await db
      .select()
      .from(marketingBannersTable)
      .orderBy(asc(marketingBannersTable.sortOrder), desc(marketingBannersTable.createdAt));
    return res.json({ banners });
  } catch (err) {
    logger.error({ err }, "admin get banners error");
    return res.status(500).json({ error: "Failed to load banners" });
  }
});

adminRouter.post("/banners", async (req: AuthRequest, res) => {
  try {
    const {
      title, subtitle, imageUrl, bgColorFrom, bgColorTo, iconName,
      linkType, linkTarget, targetAudience, isActive, sortOrder, expiresAt,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const id = generateId();
    const [banner] = await db.insert(marketingBannersTable).values({
      id,
      title: title.trim(),
      subtitle: subtitle?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      bgColorFrom: bgColorFrom || "#1A6EE0",
      bgColorTo: bgColorTo || "#0D4BA0",
      iconName: iconName || "star",
      linkType: linkType || "none",
      linkTarget: linkTarget?.trim() || null,
      targetAudience: targetAudience || "all",
      isActive: isActive !== false,
      sortOrder: sortOrder ?? 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.banner.create",
      target: "marketing_banner",
      targetId: id,
      details: { title },
    });

    return res.status(201).json({ banner });
  } catch (err) {
    logger.error({ err }, "create banner error");
    return res.status(500).json({ error: "Failed to create banner" });
  }
});

adminRouter.patch("/banners/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title, subtitle, imageUrl, bgColorFrom, bgColorTo, iconName,
      linkType, linkTarget, targetAudience, isActive, sortOrder, expiresAt,
    } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (subtitle !== undefined) updates.subtitle = subtitle?.trim() || null;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl?.trim() || null;
    if (bgColorFrom !== undefined) updates.bgColorFrom = bgColorFrom;
    if (bgColorTo !== undefined) updates.bgColorTo = bgColorTo;
    if (iconName !== undefined) updates.iconName = iconName;
    if (linkType !== undefined) updates.linkType = linkType;
    if (linkTarget !== undefined) updates.linkTarget = linkTarget?.trim() || null;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const [updated] = await db
      .update(marketingBannersTable)
      .set(updates as any)
      .where(eq(marketingBannersTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Banner not found" });

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.banner.update",
      target: "marketing_banner",
      targetId: id,
      details: {},
    });

    return res.json({ banner: updated });
  } catch (err) {
    logger.error({ err }, "update banner error");
    return res.status(500).json({ error: "Failed to update banner" });
  }
});

adminRouter.delete("/banners/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await db.delete(marketingBannersTable).where(eq(marketingBannersTable.id, id));

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.banner.delete",
      target: "marketing_banner",
      targetId: id,
      details: {},
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "delete banner error");
    return res.status(500).json({ error: "Failed to delete banner" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Announcements CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/announcements", async (_req, res) => {
  try {
    const announcements = await db
      .select()
      .from(appAnnouncementsTable)
      .orderBy(desc(appAnnouncementsTable.priority), desc(appAnnouncementsTable.createdAt));
    return res.json({ announcements });
  } catch (err) {
    logger.error({ err }, "admin get announcements error");
    return res.status(500).json({ error: "Failed to load announcements" });
  }
});

adminRouter.post("/announcements", async (req: AuthRequest, res) => {
  try {
    const {
      title, message, buttonText, buttonLink, imageUrl,
      targetAudience, isActive, showOnce, priority, expiresAt,
    } = req.body;

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const id = generateId();
    const [announcement] = await db.insert(appAnnouncementsTable).values({
      id,
      title: title.trim(),
      message: message.trim(),
      buttonText: buttonText || "Got it",
      buttonLink: buttonLink?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      targetAudience: targetAudience || "all",
      isActive: isActive !== false,
      showOnce: showOnce !== false,
      priority: priority ?? 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    const admin = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.user!.userId) });
    await db.insert(auditLogTable).values({
      id: generateId(),
      adminId: req.user!.userId,
      adminName: admin?.name || "Admin",
      adminRole: admin?.adminRole || null,
      action: "marketing.announcement.create",
      target: "app_announcement",
      targetId: id,
      details: { title },
    });

    return res.status(201).json({ announcement });
  } catch (err) {
    logger.error({ err }, "create announcement error");
    return res.status(500).json({ error: "Failed to create announcement" });
  }
});

adminRouter.patch("/announcements/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title, message, buttonText, buttonLink, imageUrl,
      targetAudience, isActive, showOnce, priority, expiresAt,
    } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (message !== undefined) updates.message = message.trim();
    if (buttonText !== undefined) updates.buttonText = buttonText;
    if (buttonLink !== undefined) updates.buttonLink = buttonLink?.trim() || null;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl?.trim() || null;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (isActive !== undefined) updates.isActive = isActive;
    if (showOnce !== undefined) updates.showOnce = showOnce;
    if (priority !== undefined) updates.priority = priority;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

    const [updated] = await db
      .update(appAnnouncementsTable)
      .set(updates as any)
      .where(eq(appAnnouncementsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Announcement not found" });
    return res.json({ announcement: updated });
  } catch (err) {
    logger.error({ err }, "update announcement error");
    return res.status(500).json({ error: "Failed to update announcement" });
  }
});

adminRouter.delete("/announcements/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await db.delete(appAnnouncementsTable).where(eq(appAnnouncementsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "delete announcement error");
    return res.status(500).json({ error: "Failed to delete announcement" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: FAQs CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/faqs", async (_req, res) => {
  try {
    const faqs = await db
      .select()
      .from(faqsTable)
      .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));
    return res.json({ faqs });
  } catch (err) {
    logger.error({ err }, "admin get faqs error");
    return res.status(500).json({ error: "Failed to load FAQs" });
  }
});

adminRouter.post("/faqs", async (req: AuthRequest, res) => {
  try {
    const { question, answer, category, targetAudience, sortOrder, isActive } = req.body;

    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ error: "Question and answer are required" });
    }

    const id = generateId();
    const [faq] = await db.insert(faqsTable).values({
      id,
      question: question.trim(),
      answer: answer.trim(),
      category: category || "general",
      targetAudience: targetAudience || "all",
      sortOrder: sortOrder ?? 0,
      isActive: isActive !== false,
    }).returning();

    return res.status(201).json({ faq });
  } catch (err) {
    logger.error({ err }, "create faq error");
    return res.status(500).json({ error: "Failed to create FAQ" });
  }
});

adminRouter.patch("/faqs/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, targetAudience, sortOrder, isActive } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (question !== undefined) updates.question = question.trim();
    if (answer !== undefined) updates.answer = answer.trim();
    if (category !== undefined) updates.category = category;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db
      .update(faqsTable)
      .set(updates as any)
      .where(eq(faqsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "FAQ not found" });
    return res.json({ faq: updated });
  } catch (err) {
    logger.error({ err }, "update faq error");
    return res.status(500).json({ error: "Failed to update FAQ" });
  }
});

adminRouter.delete("/faqs/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await db.delete(faqsTable).where(eq(faqsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "delete faq error");
    return res.status(500).json({ error: "Failed to delete FAQ" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Service Areas CRUD
// ─────────────────────────────────────────────────────────────────────────────
adminRouter.get("/areas", async (_req, res) => {
  try {
    const areas = await db
      .select()
      .from(serviceAreasTable)
      .orderBy(asc(serviceAreasTable.sortOrder), asc(serviceAreasTable.name));
    return res.json({ areas });
  } catch (err) {
    logger.error({ err }, "admin get areas error");
    return res.status(500).json({ error: "Failed to load service areas" });
  }
});

adminRouter.post("/areas", async (req: AuthRequest, res) => {
  try {
    const { name, province, isActive, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const id = generateId();
    const [area] = await db.insert(serviceAreasTable).values({
      id,
      name: name.trim(),
      province: province?.trim() || null,
      isActive: isActive !== false,
      sortOrder: sortOrder ?? 0,
    }).returning();

    return res.status(201).json({ area });
  } catch (err) {
    logger.error({ err }, "create area error");
    return res.status(500).json({ error: "Failed to create area" });
  }
});

adminRouter.patch("/areas/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, province, isActive, sortOrder } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (province !== undefined) updates.province = province?.trim() || null;
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db
      .update(serviceAreasTable)
      .set(updates as any)
      .where(eq(serviceAreasTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Area not found" });
    return res.json({ area: updated });
  } catch (err) {
    logger.error({ err }, "update area error");
    return res.status(500).json({ error: "Failed to update area" });
  }
});

adminRouter.delete("/areas/:id", async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await db.delete(serviceAreasTable).where(eq(serviceAreasTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "delete area error");
    return res.status(500).json({ error: "Failed to delete area" });
  }
});

export { publicRouter as marketingPublicRouter, adminRouter as marketingAdminRouter };
