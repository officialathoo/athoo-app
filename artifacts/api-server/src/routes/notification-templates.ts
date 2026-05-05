import { Router, type Response } from "express";
import { db } from "@workspace/db";
import { notificationTemplatesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, requirePermission, type AuthRequest } from "../middlewares/auth";
import crypto from "crypto";

function generateId(): string { return crypto.randomUUID(); }

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /admin/notification-templates
router.get("/", async (_req, res: Response) => {
  try {
    const templates = await db
      .select()
      .from(notificationTemplatesTable)
      .orderBy(asc(notificationTemplatesTable.channel), asc(notificationTemplatesTable.name));
    return res.json({ templates });
  } catch {
    return res.status(500).json({ error: "Failed to load templates" });
  }
});

// POST /admin/notification-templates
router.post("/", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { key, name, channel, targetAudience, subject, body, isActive } = req.body as Record<string, any>;
    if (!key?.trim() || !name?.trim() || !channel?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "key, name, channel, and body are required" });
    }
    const existing = await db.query.notificationTemplatesTable.findFirst({
      where: eq(notificationTemplatesTable.key, key.trim()),
    });
    if (existing) return res.status(409).json({ error: "A template with this key already exists" });

    const template = {
      id: generateId(),
      key: key.trim(),
      name: name.trim(),
      channel: channel.trim(),
      targetAudience: targetAudience || "all",
      subject: subject?.trim() || null,
      body: body.trim(),
      isActive: isActive !== false,
    };
    await db.insert(notificationTemplatesTable).values(template);
    return res.json({ template });
  } catch {
    return res.status(500).json({ error: "Failed to create template" });
  }
});

// PATCH /admin/notification-templates/:id
router.patch("/:id", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, subject, body, isActive, targetAudience } = req.body as Record<string, any>;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) update.name = name.trim();
    if (subject !== undefined) update.subject = subject?.trim() || null;
    if (body !== undefined) update.body = body.trim();
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (targetAudience !== undefined) update.targetAudience = targetAudience;
    await db.update(notificationTemplatesTable).set(update).where(eq(notificationTemplatesTable.id, req.params.id as string));
    const updated = await db.query.notificationTemplatesTable.findFirst({
      where: eq(notificationTemplatesTable.id, req.params.id as string),
    });
    return res.json({ template: updated });
  } catch {
    return res.status(500).json({ error: "Failed to update template" });
  }
});

// DELETE /admin/notification-templates/:id
router.delete("/:id", requirePermission("settings.write"), async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(notificationTemplatesTable).where(eq(notificationTemplatesTable.id, req.params.id as string));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to delete template" });
  }
});

export default router;
