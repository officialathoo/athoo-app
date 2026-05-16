import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  role: text("role").notNull(),
  email: text("email"),
  profileImage: text("profile_image"),
  profileColor: text("profile_color").default("#1A6EE0"),
  bio: text("bio"),
  experience: text("experience"),
  services: text("services").array().default([]),
  location: text("location"),
  password: text("password"),
  isVerified: boolean("is_verified").default(false),
  isAvailable: boolean("is_available").default(true),
  rating: integer("rating").default(0),
  ratingCount: integer("rating_count").default(0),
  totalJobs: integer("total_jobs").default(0),
  ratePerHour: integer("rate_per_hour"),
  isDeactivated: boolean("is_deactivated").default(false),
  pendingCommission: integer("pending_commission").default(0),
  totalCommission: integer("total_commission").default(0),
  commissionLimit: integer("commission_limit").default(5000),
  isBlocked: boolean("is_blocked").default(false),
  blockedReason: text("blocked_reason"),
  adminNotes: text("admin_notes"),
  verificationStatus: text("verification_status").default("pending"), // pending | in_process | approved | rejected
  verificationNote: text("verification_note"),
  expoPushToken: text("expo_push_token"),
  lastCommissionPaymentAt: timestamp("last_commission_payment_at"),
  adminRole: text("admin_role"),
  adminPermissions: jsonb("admin_permissions").$type<string[]>().default([]),
  // Identity / KYC
  fatherName: text("father_name"),
  cnicNumber: text("cnic_number"),
  cnicExpiry: text("cnic_expiry"),
  dob: text("dob"),
  // Account lifecycle
  accountStatus: text("account_status").default("active"), // active | deactivated | pending_deletion | deleted
  deletionScheduledAt: timestamp("deletion_scheduled_at"),
  // Referral
  referralCode: text("referral_code"),
  referredBy: text("referred_by"),
  referralCount: integer("referral_count").default(0),
  // Service radius
  maxTravelDistanceKm: integer("max_travel_distance_km"),
  // Preferences
  language: text("language").default("en"), // en | ur
  biometricEnabled: boolean("biometric_enabled").default(false),
  // Premium
  isPremium: boolean("is_premium").default(false),
  premiumPlanId: text("premium_plan_id"),
  premiumExpiresAt: timestamp("premium_expires_at"),
  // Reliability / cooldown — incremented on every auto-cancel sweep, used to
  // de-rank chronic no-shows and to enforce a temporary cooldown.
  noShowCount: integer("no_show_count").default(0),
  cooldownUntil: timestamp("cooldown_until"),
  // Email verification & contact preferences
  emailVerified: boolean("email_verified").default(false),
  // Geo (used for nearest-provider matching, no paid Maps API needed)
  latitude: text("latitude"),
  longitude: text("longitude"),
  joinedAt: timestamp("joined_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("users_role_idx").on(t.role),
  index("users_verification_status_idx").on(t.verificationStatus),
  index("users_is_available_idx").on(t.isAvailable),
  index("users_is_blocked_idx").on(t.isBlocked),
  index("users_referral_code_idx").on(t.referralCode),
  index("users_email_idx").on(t.email),
  index("users_account_status_idx").on(t.accountStatus),
]);

// Service categories — admin-managed list shown to customers
export const serviceCategoriesTable = pgTable("service_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameUr: text("name_ur"),
  slug: text("slug").notNull().unique(),
  icon: text("icon").default("tool"),
  color: text("color").default("#1A6EE0"),
  visitCharge: integer("visit_charge").default(0), // base/visiting fee in PKR
  description: text("description"),
  commissionPct: real("commission_pct").default(10), // provider commission %
  platformFeePct: real("platform_fee_pct").default(5), // customer platform fee %
  minHourlyRate: integer("min_hourly_rate"), // min allowed hourly rate PKR
  maxHourlyRate: integer("max_hourly_rate"), // max allowed hourly rate PKR
  estimatedDurationHrs: real("estimated_duration_hrs"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bank/JazzCash/Easypaisa accounts the platform receives commission payments at
export const paymentAccountsTable = pgTable("payment_accounts", {
  id: text("id").primaryKey(),
  label: text("label").notNull(), // e.g. "HBL Main", "JazzCash Business"
  bankName: text("bank_name"),
  accountTitle: text("account_title").notNull(),
  accountNumber: text("account_number").notNull(),
  iban: text("iban"),
  instructions: text("instructions"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Commission payments providers send in (with screenshot proof)
export const commissionPaymentsTable = pgTable("commission_payments", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  accountId: text("account_id"), // payment_accounts.id (nullable in case account was deleted)
  reference: text("reference"), // bank reference / TID
  screenshotUrl: text("screenshot_url"),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Provider requests to add a new service to their profile
export const serviceAddRequestsTable = pgTable("service_add_requests", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  serviceCategoryId: text("service_category_id"),
  serviceName: text("service_name").notNull(),
  documents: jsonb("documents").$type<{ type: string; url: string; label?: string }[]>().default([]),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Premium subscription plans (admin-managed)
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  audience: text("audience").notNull().default("provider"), // provider | customer | both
  priceMonthly: integer("price_monthly").default(0),
  priceYearly: integer("price_yearly").default(0),
  features: jsonb("features").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User subscriptions (provider or customer) — payment tracking
export const userSubscriptionsTable = pgTable("user_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => subscriptionPlansTable.id),
  billingPeriod: text("billing_period").notNull().default("monthly"), // monthly | yearly
  status: text("status").notNull().default("pending"), // pending | active | expired | cancelled
  amount: integer("amount").notNull(),
  paymentReference: text("payment_reference"),
  screenshotUrl: text("screenshot_url"),
  startedAt: timestamp("started_at"),
  expiresAt: timestamp("expires_at"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Account deletion requests — 7-day grace period before permanent removal
export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason"),
  requestedAt: timestamp("requested_at").defaultNow(),
  scheduledDeleteAt: timestamp("scheduled_delete_at").notNull(),
  status: text("status").notNull().default("pending"), // pending | cancelled | completed
  cancelledAt: timestamp("cancelled_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email change requests — verified via OTP to the new email
export const emailChangeRequestsTable = pgTable("email_change_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  newEmail: text("new_email").notNull(),
  otpCode: text("otp_code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Phone change requests — verified via OTP to the new phone
export const phoneChangeRequestsTable = pgTable("phone_change_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  newPhone: text("new_phone").notNull(),
  otpCode: text("otp_code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const otpsTable = pgTable("otps", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("otps_phone_idx").on(t.phone),
  index("otps_used_expires_idx").on(t.used, t.expiresAt),
]);

export const bookingsTable = pgTable("bookings", {
  id: text("id").primaryKey(),
  publicId: text("public_id").unique(),
  customerId: text("customer_id").notNull().references(() => usersTable.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  providerId: text("provider_id").notNull().references(() => usersTable.id),
  providerName: text("provider_name").notNull(),
  providerPhone: text("provider_phone").notNull(),
  service: text("service").notNull(),
  serviceIcon: text("service_icon").notNull().default("tool"),
  description: text("description"),
  attachment: text("attachment"),
  address: text("address").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status").notNull().default("pending"),
  price: integer("price"),
  // Negotiation pricing fields — final agreed terms used for invoicing
  ratePerHour: integer("rate_per_hour"),
  hours: real("hours"),
  travelCharge: integer("travel_charge"),
  // Source of booking — direct, broadcast, or negotiation
  source: text("source").default("direct"),
  // Reference IDs for tracing back to the original broadcast/negotiation
  broadcastRequestId: text("broadcast_request_id"),
  broadcastResponseId: text("broadcast_response_id"),
  commissionAmount: integer("commission_amount").default(0),
  providerAmount: integer("provider_amount").default(0),
  commissionRate: integer("commission_rate").default(0),
  pickedLat: real("picked_lat"),
  pickedLng: real("picked_lng"),
  customerLat: real("customer_lat"),
  customerLng: real("customer_lng"),
  providerLat: real("provider_lat"),
  providerLng: real("provider_lng"),
  providerAccuracy: real("provider_accuracy"),
  providerUpdatedAt: timestamp("provider_updated_at"),
  providerArrivedAt: timestamp("provider_arrived_at"),
  startPin: text("start_pin"),
  startPinExpiresAt: timestamp("start_pin_expires_at"),
  completePin: text("complete_pin"),
  completePinExpiresAt: timestamp("complete_pin_expires_at"),
  // Set once the customer has been auto-prompted to rate the completed job;
  // prevents the sweeper from re-pinging on every tick.
  ratingReminderSentAt: timestamp("rating_reminder_sent_at"),
  preJobReminderSentAt: timestamp("pre_job_reminder_sent_at"),
  jobStartedAt: timestamp("job_started_at"),
  visitCharge: integer("visit_charge").default(0),
  categorySlug: text("category_slug"),
  // Cash payment confirmation: pending → paid (customer) → received (provider)
  paymentStatus: text("payment_status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  receivedAt: timestamp("received_at"),
  rating: integer("rating"),
  review: text("review"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("bookings_customer_id_idx").on(t.customerId),
  index("bookings_provider_id_idx").on(t.providerId),
  index("bookings_status_idx").on(t.status),
  index("bookings_created_at_idx").on(t.createdAt),
]);

export const negotiationsTable = pgTable("negotiations", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  providerId: text("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  service: text("service").notNull(),
  customerOffer: integer("customer_offer").notNull(),
  providerCounter: integer("provider_counter"),
  finalPrice: integer("final_price"),
  status: text("status").notNull().default("customer_offer"),
  // Auto-expire deadline for the side currently expected to respond. When
  // the deadline passes, lazy reads / a sweep mark the negotiation as
  // `rejected` so neither side can accept a stale offer.
  expiresAt: timestamp("expires_at"),
  messages: jsonb("messages").$type<NegotiationMessage[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatsTable = pgTable("chats", {
  id: text("id").primaryKey(),
  participant1Id: text("participant1_id").notNull(),
  participant2Id: text("participant2_id").notNull(),
  participant1Name: text("participant1_name").notNull(),
  participant2Name: text("participant2_name").notNull(),
  bookingId: text("booking_id"),
  service: text("service"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  chatsParticipant1Idx: index("chats_participant1_id_idx").on(t.participant1Id),
  chatsParticipant2Idx: index("chats_participant2_id_idx").on(t.participant2Id),
  chatsBookingIdx: index("chats_booking_id_idx").on(t.bookingId),
}));

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  text: text("text").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("messages_chat_id_idx").on(t.chatId),
  index("messages_sender_id_idx").on(t.senderId),
]);

export const callsTable = pgTable("calls", {
  id: text("id").primaryKey(),
  callerId: text("caller_id").notNull(),
  callerName: text("caller_name").notNull(),
  receiverId: text("receiver_id").notNull(),
  callerInitials: text("caller_initials").notNull().default("??"),
  callerColor: text("caller_color").default("#1A6EE0"),
  service: text("service"),
  status: text("status").notNull().default("ringing"),
  offer: text("offer"),
  answer: text("answer"),
  callerCandidates: text("caller_candidates").default("[]"),
  calleeCandidates: text("callee_candidates").default("[]"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const adminBroadcastsTable = pgTable("admin_broadcasts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  audience: text("audience").notNull().default("all"),
  createdBy: text("created_by").notNull(),
  createdByName: text("created_by_name"),
  sentCount: integer("sent_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const savedAddressesTable = pgTable("saved_addresses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  label: text("label").notNull(),
  address: text("address").notNull(),
  icon: text("icon").notNull().default("map-pin"),
  isDefault: boolean("is_default").default(false),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportTicketsTable = pgTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  userName: text("user_name").notNull(),
  userPhone: text("user_phone").notNull(),
  userRole: text("user_role").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  bookingId: text("booking_id"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  adminNotes: text("admin_notes"),
  resolutionNote: text("resolution_note"),
  assignedTo: text("assigned_to"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("support_tickets_user_id_idx").on(t.userId),
  index("support_tickets_status_idx").on(t.status),
]);

// Audit log — every admin action
export const auditLogTable = pgTable("audit_log", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  adminName: text("admin_name").notNull(),
  adminRole: text("admin_role"),
  action: text("action").notNull(),
  target: text("target"),
  targetId: text("target_id"),
  details: jsonb("details"),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Internal admin notifications
export const adminNotificationsTable = pgTable("admin_notifications", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  link: text("link"),
  targetAdminId: text("target_admin_id"),
  readByAdminIds: jsonb("read_by_admin_ids").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ticket notes — admin internal notes on support tickets
export const ticketNotesTable = pgTable("ticket_notes", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => supportTicketsTable.id),
  adminId: text("admin_id").notNull(),
  adminName: text("admin_name").notNull(),
  note: text("note").notNull(),
  isInternal: boolean("is_internal").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Provider verification documents (CNIC front/back, license, etc.)
export const providerDocumentsTable = pgTable("provider_documents", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // cnic_front | cnic_back | license | selfie | other
  label: text("label"),
  url: text("url").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  rejectionNote: text("rejection_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer favorites — saved providers
export const savedProvidersTable = pgTable("saved_providers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// In-app notifications for customers and providers (broadcast targets, system events)
export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("info"), // info | broadcast | booking | system | promotion
  link: text("link"),
  data: jsonb("data"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("notifications_user_id_idx").on(t.userId),
  index("notifications_is_read_idx").on(t.isRead),
]);

// Promotions / discount codes
export const promotionsTable = pgTable("promotions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull().default("percentage"),
  discountValue: integer("discount_value").notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  minBookingValue: integer("min_booking_value"),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customer-initiated refund / dispute requests on completed bookings.
export const refundRequestsTable = pgTable("refund_requests", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  amountRequested: integer("amount_requested").notNull(),
  evidenceUrl: text("evidence_url"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Provider payout / withdrawal requests against accumulated earnings.
export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  bankName: text("bank_name"),
  accountTitle: text("account_title").notNull(),
  accountNumber: text("account_number").notNull(),
  iban: text("iban"),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | paid
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionNote: text("rejection_note"),
  paidAt: timestamp("paid_at"),
  paymentReference: text("payment_reference"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type RefundRequest = typeof refundRequestsTable.$inferSelect;
export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;

export interface NegotiationMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  offerAmount?: number;
  timestamp: string;
}

export const insertUserSchema = createInsertSchema(usersTable).omit({
  joinedAt: true,
  updatedAt: true,
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertNegotiationSchema = createInsertSchema(negotiationsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type Negotiation = typeof negotiationsTable.$inferSelect;
export type Chat = typeof chatsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type Call = typeof callsTable.$inferSelect;
export type AppSettings = typeof appSettingsTable.$inferSelect;
export type AdminBroadcast = typeof adminBroadcastsTable.$inferSelect;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type SavedAddress = typeof savedAddressesTable.$inferSelect;
export type AuditLog = typeof auditLogTable.$inferSelect;
export type AdminNotification = typeof adminNotificationsTable.$inferSelect;
export type TicketNote = typeof ticketNotesTable.$inferSelect;
export type Promotion = typeof promotionsTable.$inferSelect;
export type ProviderDocument = typeof providerDocumentsTable.$inferSelect;
export type SavedProvider = typeof savedProvidersTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type ServiceCategory = typeof serviceCategoriesTable.$inferSelect;
export type PaymentAccount = typeof paymentAccountsTable.$inferSelect;
export type CommissionPayment = typeof commissionPaymentsTable.$inferSelect;
export type ServiceAddRequest = typeof serviceAddRequestsTable.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type UserSubscription = typeof userSubscriptionsTable.$inferSelect;
export type AccountDeletionRequest = typeof accountDeletionRequestsTable.$inferSelect;
export type EmailChangeRequest = typeof emailChangeRequestsTable.$inferSelect;
export type PhoneChangeRequest = typeof phoneChangeRequestsTable.$inferSelect;
export type InsertUser = any;
export type InsertBooking = any;
export type InsertNegotiation = any;

// ─── InDrive-style Broadcast Requests ────────────────────────────────────────
// Customer posts a job to ALL nearby providers in a category simultaneously.
// Providers respond with accept-at-offered-price or a counter price.
// Customer then picks any one response to convert into a formal booking.

export const broadcastRequestsTable = pgTable("broadcast_requests", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  // service category slug/id (e.g. "plumber", "electrician")
  service: text("service").notNull(),
  serviceLabel: text("service_label").notNull(),
  serviceIcon: text("service_icon").default("tool"),
  description: text("description"),
  // Video clip URL (≤30 s, stored as base64 or object-storage URL)
  videoUrl: text("video_url"),
  address: text("address").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  // Customer's opening offer; null = "name your price"
  customerOffer: integer("customer_offer"),
  // Detailed pricing from customer
  customerRatePerHour: integer("customer_rate_per_hour"),
  customerHours: real("customer_hours"),
  customerTravelCharge: integer("customer_travel_charge"),
  // open | accepted | cancelled | expired
  status: text("status").notNull().default("open"),
  // Which broadcastResponsesTable.id the customer chose
  acceptedResponseId: text("accepted_response_id"),
  // The booking created once a provider response is selected
  bookingId: text("booking_id"),
  // Broadcast expires after 30 min if no provider is selected
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("broadcast_requests_status_idx").on(t.status),
  index("broadcast_requests_customer_id_idx").on(t.customerId),
  index("broadcast_requests_expires_at_idx").on(t.expiresAt),
]);

export const broadcastResponsesTable = pgTable("broadcast_responses", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => broadcastRequestsTable.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  providerName: text("provider_name").notNull(),
  // null = provider accepts customer's offered price; set = provider counter
  providerOffer: integer("provider_offer"),
  // Detailed pricing from provider
  providerRatePerHour: integer("provider_rate_per_hour"),
  providerHours: real("provider_hours"),
  providerTravelCharge: integer("provider_travel_charge"),
  // Whether provider accepted customer's price directly (no counter)
  isDirectAccept: boolean("is_direct_accept").default(false),
  message: text("message"),
  // pending | accepted_by_customer | rejected_by_customer | withdrawn | not_selected
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  responseRequestIdx: index("broadcast_responses_request_id_idx").on(t.requestId),
  responseProviderIdx: index("broadcast_responses_provider_id_idx").on(t.providerId),
  responseStatusIdx: index("broadcast_responses_status_idx").on(t.status),
}));

export type BroadcastRequest = typeof broadcastRequestsTable.$inferSelect;
export type BroadcastResponse = typeof broadcastResponsesTable.$inferSelect;

// ─── Marketing Banners ────────────────────────────────────────────────────────
// Admin-managed promotional banners displayed on customer/provider home screens.
export const marketingBannersTable = pgTable("marketing_banners", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url"),
  bgColorFrom: text("bg_color_from").default("#1A6EE0"),
  bgColorTo: text("bg_color_to").default("#0D4BA0"),
  iconName: text("icon_name").default("star"),
  linkType: text("link_type").default("none"), // none | category | url | booking
  linkTarget: text("link_target"), // service slug or URL
  targetAudience: text("target_audience").default("all"), // all | customer | provider
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── App Announcements / Popups ───────────────────────────────────────────────
// Admin-controlled modal announcements shown on app open (once or always).
export const appAnnouncementsTable = pgTable("app_announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  buttonText: text("button_text").default("Got it"),
  buttonLink: text("button_link"),
  imageUrl: text("image_url"),
  targetAudience: text("target_audience").default("all"), // all | customer | provider
  isActive: boolean("is_active").default(true),
  showOnce: boolean("show_once").default(true),
  priority: integer("priority").default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── FAQ / Help Content ───────────────────────────────────────────────────────
// Admin-managed FAQ entries shown in the mobile app help screens.
export const faqsTable = pgTable("faqs", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").default("general"), // general | booking | payment | technical | safety
  targetAudience: text("target_audience").default("all"), // all | customer | provider
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Service Areas ────────────────────────────────────────────────────────────
// Admin-managed cities/areas where Athoo operates.
export const serviceAreasTable = pgTable("service_areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  province: text("province"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type MarketingBanner = typeof marketingBannersTable.$inferSelect;
export type AppAnnouncement = typeof appAnnouncementsTable.$inferSelect;
export type Faq = typeof faqsTable.$inferSelect;
export type ServiceArea = typeof serviceAreasTable.$inferSelect;

// ─── Reviews (standalone queryable rating records) ────────────────────────────
export const reviewsTable = pgTable("reviews", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reviewerName: text("reviewer_name").notNull(),
  reviewedId: text("reviewed_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reviewedName: text("reviewed_name").notNull(),
  rating: integer("rating").notNull(), // 1–5
  review: text("review"),
  isDisputed: boolean("is_disputed").default(false),
  disputeNote: text("dispute_note"),
  disputeResolvedAt: timestamp("dispute_resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoicesTable = pgTable("invoices", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(), // ATH-000001
  bookingId: text("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  providerName: text("provider_name").notNull(),
  service: text("service").notNull(),
  address: text("address").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  ratePerHour: integer("rate_per_hour"),
  hours: integer("hours"),
  subtotal: integer("subtotal").notNull(),
  visitCharge: integer("visit_charge").default(0),
  platformFee: integer("platform_fee").default(0),   // 5% from customer
  discountAmount: integer("discount_amount").default(0),
  totalAmount: integer("total_amount").notNull(),
  commissionRate: integer("commission_rate"),
  commissionAmount: integer("commission_amount").default(0), // 10% from provider
  providerAmount: integer("provider_amount").notNull(),
  pdfUrl: text("pdf_url"),
  status: text("status").default("issued"), // issued | paid | disputed | cancelled
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  invoiceBookingIdx: index("invoices_booking_id_idx").on(t.bookingId),
  invoiceCustomerIdx: index("invoices_customer_id_idx").on(t.customerId),
  invoiceProviderIdx: index("invoices_provider_id_idx").on(t.providerId),
  invoiceStatusIdx: index("invoices_status_idx").on(t.status),
}));

// ─── Report Issues ────────────────────────────────────────────────────────────
export const reportIssuesTable = pgTable("report_issues", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
  reporterId: text("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reporterName: text("reporter_name").notNull(),
  reporterRole: text("reporter_role").notNull(), // customer | provider
  reportedId: text("reported_id").references(() => usersTable.id, { onDelete: "set null" }),
  reportedName: text("reported_name"),
  category: text("category").notNull(), // fraud | behavior | quality | payment | other
  description: text("description").notNull(),
  status: text("status").default("open"), // open | under_review | resolved | dismissed
  adminNote: text("admin_note"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Hourly Rate Change Requests ──────────────────────────────────────────────
export const hourlyRateRequestsTable = pgTable("hourly_rate_requests", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  providerName: text("provider_name").notNull(),
  service: text("service").notNull(),
  currentRate: integer("current_rate"),
  requestedRate: integer("requested_rate").notNull(),
  reason: text("reason"),
  status: text("status").default("pending"), // pending | approved | rejected
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Notification Templates ───────────────────────────────────────────────────
export const notificationTemplatesTable = pgTable("notification_templates", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // booking_confirmed, job_completed, etc.
  name: text("name").notNull(),
  channel: text("channel").notNull(), // push | sms | email
  targetAudience: text("target_audience").default("all"), // all | customer | provider
  subject: text("subject"),
  body: text("body").notNull(), // template with {{placeholders}}
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Login History ────────────────────────────────────────────────────────────
export const loginHistoryTable = pgTable("login_history", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  phone: text("phone"),
  email: text("email"),
  role: text("role"),
  method: text("method").notNull(), // otp | password | biometric
  success: boolean("success").notNull(),
  failReason: text("fail_reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  loginHistoryUserIdx: index("login_history_user_id_idx").on(t.userId),
  loginHistoryCreatedIdx: index("login_history_created_at_idx").on(t.createdAt),
}));

// ─── User Blocks ──────────────────────────────────────────────────────────────
export const userBlocksTable = pgTable("user_blocks", {
  id: text("id").primaryKey(),
  blockerId: text("blocker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Admin Blacklist ──────────────────────────────────────────────────────────
export const adminBlacklistTable = pgTable("admin_blacklist", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'phone' | 'email'
  value: text("value").notNull(),
  reason: text("reason"),
  addedBy: text("added_by").references(() => usersTable.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Emergency Contacts ───────────────────────────────────────────────────────
export const emergencyContactsTable = pgTable("emergency_contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  number: text("number").notNull(),
  description: text("description"),
  icon: text("icon").default("phone-call"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Review = typeof reviewsTable.$inferSelect;
export type Invoice = typeof invoicesTable.$inferSelect;
export type ReportIssue = typeof reportIssuesTable.$inferSelect;
export type HourlyRateRequest = typeof hourlyRateRequestsTable.$inferSelect;
export type NotificationTemplate = typeof notificationTemplatesTable.$inferSelect;
export type LoginHistory = typeof loginHistoryTable.$inferSelect;
export type UserBlock = typeof userBlocksTable.$inferSelect;
export type AdminBlacklist = typeof adminBlacklistTable.$inferSelect;
export type EmergencyContact = typeof emergencyContactsTable.$inferSelect;
