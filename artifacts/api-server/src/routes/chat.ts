import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router } from "express";
import { db } from "@workspace/db";
import { chatsTable, messagesTable } from "@workspace/db/schema";
import { eq, or, and, ne, sql } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";
import { Response } from "express";
import { emitToUser } from "../lib/eventBus";

const router = Router();

function generateId(): string {
  return crypto.randomUUID();
}

router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chats = await db
      .select()
      .from(chatsTable)
      .where(
        or(
          eq(chatsTable.participant1Id, userId),
          eq(chatsTable.participant2Id, userId)
        )
      );
    res.json({ chats });
  } catch (e) {
    logger.error({ err: e }, "chat list error");
    res.status(500).json({ error: "Failed to load chats" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { otherUserId, otherUserName, myName, bookingId, service } = req.body;

    const existing = await db.query.chatsTable.findFirst({
      where: or(
        and(eq(chatsTable.participant1Id, userId), eq(chatsTable.participant2Id, otherUserId)),
        and(eq(chatsTable.participant1Id, otherUserId), eq(chatsTable.participant2Id, userId))
      ),
    });

    if (existing) {
      res.json({ chat: existing });
      return;
    }

    const chat = {
      id: generateId(),
      participant1Id: userId,
      participant2Id: otherUserId,
      participant1Name: myName,
      participant2Name: otherUserName,
      bookingId: bookingId || null,
      service: service || null,
    };

    await db.insert(chatsTable).values(chat);
    res.json({ chat });
  } catch (e) {
    logger.error({ err: e }, "chat create error");
    res.status(500).json({ error: "Failed to create chat" });
  }
});

router.get("/:chatId/messages", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = req.params.chatId as string;

    // Verify the caller is a participant of this chat
    const chat = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, chatId) });
    if (!chat) { res.status(404).json({ error: "Chat not found" }); return; }
    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      res.status(403).json({ error: "Not a participant of this chat" }); return;
    }

    const { since, limit = "50" } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);

    let whereCondition = eq(messagesTable.chatId, chatId);
    if (since) {
      const sinceDate = new Date(since as string);
      whereCondition = and(whereCondition, sql`${messagesTable.createdAt} > ${sinceDate}`) as any;
    }

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(whereCondition)
      .orderBy(messagesTable.createdAt)
      .limit(limitNum);

    res.json({ messages: msgs });
  } catch (e) {
    logger.error({ err: e }, "messages list error");
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/:chatId/messages", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { text, senderName } = req.body;

    // Verify the sender is a participant before inserting
    const chatCheck = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, String(req.params.chatId)) });
    if (!chatCheck) { res.status(404).json({ error: "Chat not found" }); return; }
    if (chatCheck.participant1Id !== userId && chatCheck.participant2Id !== userId) {
      res.status(403).json({ error: "Not a participant of this chat" }); return;
    }

    const msg = {
      id: generateId(),
      chatId: String(req.params.chatId),
      senderId: userId,
      senderName,
      text,
    };

    await db.insert(messagesTable).values(msg);

    await db
      .update(chatsTable)
      .set({ lastMessage: text, lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(chatsTable.id, String(req.params.chatId)));

    const chat = await db.query.chatsTable.findFirst({
      where: eq(chatsTable.id, String(req.params.chatId)),
    });
    if (chat) {
      const recipientId =
        chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
      if (recipientId) {
        emitToUser(recipientId, "chat:message", { message: msg, chatId: chat.id });
      }
    }

    res.json({ message: msg });
  } catch (e) {
    logger.error({ err: e }, "message send error");
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/:chatId/read", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.user!.userId;
    await db
      .update(messagesTable)
      .set({ isRead: true })
      .where(and(eq(messagesTable.chatId, chatId), ne(messagesTable.senderId, userId)));
    // Notify the other participant in real time so their unread badge / blue
    // ticks update without polling.
    const chat = await db.query.chatsTable.findFirst({ where: eq(chatsTable.id, chatId) });
    if (chat) {
      const otherUserId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
      emitToUser(otherUserId, "chat:read", { chatId, readerId: userId, ts: Date.now() });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.delete("/:chatId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const chatId = String(req.params.chatId);

    // Validate chatId format
    if (!chatId || chatId.length === 0) {
      logger.info(`Invalid chatId: ${chatId}`);
      return res.status(400).json({ error: "Invalid chat ID" });
    }

    logger.info(`Delete chat request: userId=${userId}, chatId=${chatId}`);

    // Test database connection
    try {
      await db.execute(sql`SELECT 1`);
      logger.info(`Database connection OK`);
    } catch (dbError) {
      logger.error({ err: dbError }, `Database connection failed:`);
      return res.status(500).json({ error: "Database connection failed" });
    }

    // First, verify the user is a participant of this chat
    const chat = await db.query.chatsTable.findFirst({
      where: eq(chatsTable.id, chatId),
    });

    logger.info({ chat }, `Chat found:`);

    if (!chat) {
      logger.info(`Chat not found: ${chatId}`);
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.participant1Id !== userId && chat.participant2Id !== userId) {
      logger.info(`User not authorized: userId=${userId}, participants=${chat.participant1Id},${chat.participant2Id}`);
      return res.status(403).json({ error: "You are not authorized to delete this chat" });
    }

    logger.info(`Starting deletion process for chat: ${chatId}`);

    try {
      // Delete all messages in the chat first
      logger.info(`Deleting messages for chat: ${chatId}`);
      const deleteMessagesResult = await db.delete(messagesTable).where(eq(messagesTable.chatId, chatId));
      logger.info({ result: deleteMessagesResult }, `Messages deletion result:`);

      // Then delete the chat
      logger.info(`Deleting chat: ${chatId}`);
      const deleteChatResult = await db.delete(chatsTable).where(eq(chatsTable.id, chatId));
      logger.info({ result: deleteChatResult }, `Chat deletion result:`);

      logger.info(`Deletion completed successfully for chat: ${chatId}`);
    } catch (deleteError) {
      logger.error({ err: deleteError }, "Error during deletion:");
      throw deleteError; // Re-throw to be caught by outer catch
    }

    logger.info(`Chat deleted successfully: ${chatId}`);
    return res.json({ success: true, message: "Chat deleted successfully" });
  } catch (e) {
    logger.error({ err: e }, "chat delete error:");
    logger.error({ stack: e instanceof Error ? e.stack : "No stack trace" }, "Error stack:");
    return res.status(500).json({ error: "Failed to delete chat", details: e instanceof Error ? e.message : "Unknown error" });
  }
});

export default router;

