import crypto from "crypto";
import { logger } from "../lib/logger";
import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, bookingsTable, usersTable } from "@workspace/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import type { Response } from "express";

const router = Router();

function generateId(): string {
  return crypto.randomUUID();
}

// Sequential invoice number: ATH-INV-000001
async function nextInvoiceNumber(): Promise<string> {
  const [row] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(invoicesTable);
  const seq = (Number(row?.cnt) || 0) + 1;
  return `ATH-INV-${String(seq).padStart(6, "0")}`;
}

/**
 * Auto-generate an invoice when a booking is completed.
 * Called from the verify-complete-pin handler after commission is applied.
 */
export async function generateInvoiceForBooking(bookingId: string): Promise<void> {
  try {
    const booking = await db.query.bookingsTable.findFirst({
      where: eq(bookingsTable.id, bookingId),
    });
    if (!booking || booking.status !== "completed") return;

    // Don't duplicate — check if an invoice already exists for this booking
    const existing = await db.query.invoicesTable.findFirst({
      where: eq(invoicesTable.bookingId, bookingId),
    });
    if (existing) return;

    const ratePerHour = Number(booking.ratePerHour || 0);
    const hours = Number(booking.hours || 0);
    const serviceCharge = ratePerHour > 0 && hours > 0
      ? Math.round(ratePerHour * hours)
      : Number(booking.price || 0);
    const travelCharge = Number(booking.travelCharge || 0);
    const totalAmount = serviceCharge + travelCharge;
    const commissionRate = Number(booking.commissionRate || 0);
    const commissionAmount = Number(booking.commissionAmount || 0);
    const providerAmount = Number(booking.providerAmount || Math.max(0, totalAmount - commissionAmount));

    const invoice = {
      id: generateId(),
      invoiceNumber: await nextInvoiceNumber(),
      bookingId: booking.id,
      customerId: booking.customerId,
      providerId: booking.providerId,
      customerName: booking.customerName || "Customer",
      providerName: booking.providerName || "Provider",
      service: booking.service || "Service",
      address: booking.address || "",
      scheduledDate: booking.scheduledDate || new Date().toISOString().split("T")[0],
      scheduledTime: booking.scheduledTime || "00:00",
      ratePerHour: ratePerHour || null,
      hours: hours || null,
      subtotal: serviceCharge,
      visitCharge: travelCharge,
      platformFee: 0,
      discountAmount: 0,
      totalAmount,
      commissionRate: commissionRate || null,
      commissionAmount,
      providerAmount,
      status: "issued",
    };

    await db.insert(invoicesTable).values(invoice);
    logger.info({ invoiceId: invoice.id, bookingId }, "Invoice auto-generated for completed booking");
  } catch (e) {
    logger.error({ err: e, bookingId }, "Failed to auto-generate invoice");
  }
}

// ─── List invoices for the authenticated user ─────────────────────────────────
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    let whereCondition;
    if (role === "customer") {
      whereCondition = eq(invoicesTable.customerId, userId);
    } else if (role === "provider") {
      whereCondition = eq(invoicesTable.providerId, userId);
    }
    // admin sees all

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(whereCondition)
      .orderBy(desc(invoicesTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ invoices, limit, offset, hasMore: invoices.length === limit });
  } catch (e) {
    logger.error({ err: e }, "invoices list error");
    res.status(500).json({ error: "Failed to load invoices" });
  }
});

// ─── Get single invoice ───────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await db.query.invoicesTable.findFirst({
      where: eq(invoicesTable.id, req.params.id as string),
    });
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const userId = req.user!.userId;
    if (req.user!.role !== "admin" && invoice.customerId !== userId && invoice.providerId !== userId) {
      res.status(403).json({ error: "You can only view your own invoices" });
      return;
    }

    res.json({ invoice });
  } catch (e) {
    logger.error({ err: e }, "invoice get error");
    res.status(500).json({ error: "Failed to load invoice" });
  }
});

// ─── Get invoice by booking ID ────────────────────────────────────────────────
router.get("/booking/:bookingId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await db.query.invoicesTable.findFirst({
      where: eq(invoicesTable.bookingId, req.params.bookingId as string),
    });
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found for this booking" });
      return;
    }

    const userId = req.user!.userId;
    if (req.user!.role !== "admin" && invoice.customerId !== userId && invoice.providerId !== userId) {
      res.status(403).json({ error: "You can only view your own invoices" });
      return;
    }

    res.json({ invoice });
  } catch (e) {
    logger.error({ err: e }, "invoice by booking error");
    res.status(500).json({ error: "Failed to load invoice" });
  }
});

export default router;
