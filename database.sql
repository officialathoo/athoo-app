-- ============================================================
-- ATHOO — Complete Database Schema (PostgreSQL)
-- Generated: 2026-05-04
-- ============================================================
-- Run this once against a FRESH database to create all tables.
-- For upgrading an EXISTING database, use production_sql_patch.sql instead.
-- ============================================================

-- Enable UUID extension (optional, we use text IDs)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                         TEXT PRIMARY KEY,
  name                       TEXT NOT NULL,
  phone                      TEXT NOT NULL UNIQUE,
  role                       TEXT NOT NULL,                           -- admin | provider | customer
  email                      TEXT,
  profile_image              TEXT,
  profile_color              TEXT DEFAULT '#1A6EE0',
  bio                        TEXT,
  experience                 TEXT,
  services                   TEXT[] DEFAULT '{}',
  location                   TEXT,
  password                   TEXT,
  is_verified                BOOLEAN DEFAULT FALSE,
  is_available               BOOLEAN DEFAULT TRUE,
  rating                     INTEGER DEFAULT 0,
  rating_count               INTEGER DEFAULT 0,
  total_jobs                 INTEGER DEFAULT 0,
  rate_per_hour              INTEGER,
  is_deactivated             BOOLEAN DEFAULT FALSE,
  pending_commission         INTEGER DEFAULT 0,
  total_commission           INTEGER DEFAULT 0,
  commission_limit           INTEGER DEFAULT 5000,
  is_blocked                 BOOLEAN DEFAULT FALSE,
  blocked_reason             TEXT,
  admin_notes                TEXT,
  verification_status        TEXT DEFAULT 'pending',                  -- pending | in_process | approved | rejected
  verification_note          TEXT,
  expo_push_token            TEXT,
  last_commission_payment_at TIMESTAMPTZ,
  admin_role                 TEXT,                                    -- super_admin | admin | support
  admin_permissions          JSONB DEFAULT '[]',
  -- Identity / KYC
  father_name                TEXT,
  cnic_number                TEXT,
  cnic_expiry                TEXT,
  dob                        TEXT,
  -- Account lifecycle
  account_status             TEXT DEFAULT 'active',                   -- active | deactivated | pending_deletion | deleted
  deletion_scheduled_at      TIMESTAMPTZ,
  -- Referral
  referral_code              TEXT,
  referred_by                TEXT,
  referral_count             INTEGER DEFAULT 0,
  -- Service radius
  max_travel_distance_km     INTEGER,
  -- Preferences
  language                   TEXT DEFAULT 'en',                       -- en | ur
  biometric_enabled          BOOLEAN DEFAULT FALSE,
  -- Premium
  is_premium                 BOOLEAN DEFAULT FALSE,
  premium_plan_id            TEXT,
  premium_expires_at         TIMESTAMPTZ,
  -- No-show tracking
  no_show_count              INTEGER DEFAULT 0,
  cooldown_until             TIMESTAMPTZ,
  -- Email
  email_verified             BOOLEAN DEFAULT FALSE,
  -- Geo
  latitude                   TEXT,
  longitude                  TEXT,
  joined_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_role_idx                ON users (role);
CREATE INDEX IF NOT EXISTS users_verification_status_idx ON users (verification_status);
CREATE INDEX IF NOT EXISTS users_is_available_idx        ON users (is_available);
CREATE INDEX IF NOT EXISTS users_is_blocked_idx          ON users (is_blocked);
CREATE INDEX IF NOT EXISTS users_referral_code_idx       ON users (referral_code);
CREATE INDEX IF NOT EXISTS users_email_idx               ON users (email);
CREATE INDEX IF NOT EXISTS users_account_status_idx      ON users (account_status);

-- ─── OTPs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otps (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS otps_phone_idx       ON otps (phone);
CREATE INDEX IF NOT EXISTS otps_used_expires_idx ON otps (used, expires_at);

-- ─── App Settings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Service Categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_categories (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  name_ur                TEXT,
  slug                   TEXT NOT NULL UNIQUE,
  icon                   TEXT DEFAULT 'tool',
  color                  TEXT DEFAULT '#1A6EE0',
  visit_charge           INTEGER DEFAULT 0,
  description            TEXT,
  commission_pct         REAL DEFAULT 10,
  platform_fee_pct       REAL DEFAULT 5,
  min_hourly_rate        INTEGER,
  max_hourly_rate        INTEGER,
  estimated_duration_hrs REAL,
  is_active              BOOLEAN DEFAULT TRUE,
  sort_order             INTEGER DEFAULT 0,
  created_by             TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Service Areas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_areas (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  province   TEXT,
  is_active  BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Payment Accounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_accounts (
  id             TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  bank_name      TEXT,
  account_title  TEXT NOT NULL,
  account_number TEXT NOT NULL,
  iban           TEXT,
  instructions   TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  sort_order     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Bookings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                       TEXT PRIMARY KEY,
  public_id                TEXT UNIQUE,                               -- ATH-YYYYMMDD-NNNNN
  customer_id              TEXT NOT NULL REFERENCES users (id),
  customer_name            TEXT NOT NULL,
  customer_phone           TEXT NOT NULL,
  provider_id              TEXT NOT NULL REFERENCES users (id),
  provider_name            TEXT NOT NULL,
  provider_phone           TEXT NOT NULL,
  service                  TEXT NOT NULL,
  service_icon             TEXT NOT NULL DEFAULT 'tool',
  description              TEXT,
  attachment               TEXT,
  address                  TEXT NOT NULL,
  scheduled_date           TEXT NOT NULL,
  scheduled_time           TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending',           -- pending | accepted | in_progress | completed | cancelled
  price                    INTEGER,
  commission_amount        INTEGER DEFAULT 0,
  provider_amount          INTEGER DEFAULT 0,
  commission_rate          INTEGER DEFAULT 0,
  picked_lat               REAL,
  picked_lng               REAL,
  customer_lat             REAL,
  customer_lng             REAL,
  provider_lat             REAL,
  provider_lng             REAL,
  provider_accuracy        REAL,
  provider_updated_at      TIMESTAMPTZ,
  provider_arrived_at      TIMESTAMPTZ,
  start_pin                TEXT,
  start_pin_expires_at     TIMESTAMPTZ,
  complete_pin             TEXT,
  complete_pin_expires_at  TIMESTAMPTZ,
  rating_reminder_sent_at  TIMESTAMPTZ,
  pre_job_reminder_sent_at TIMESTAMPTZ,
  job_started_at           TIMESTAMPTZ,
  visit_charge             INTEGER DEFAULT 0,
  category_slug            TEXT,
  payment_status           TEXT NOT NULL DEFAULT 'pending',           -- pending | paid | received
  paid_at                  TIMESTAMPTZ,
  received_at              TIMESTAMPTZ,
  rating                   INTEGER,
  review                   TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON bookings (customer_id);
CREATE INDEX IF NOT EXISTS bookings_provider_id_idx ON bookings (provider_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx      ON bookings (status);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx  ON bookings (created_at);

-- ─── Negotiations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS negotiations (
  id               TEXT PRIMARY KEY,
  customer_id      TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  provider_id      TEXT NOT NULL,
  provider_name    TEXT NOT NULL,
  service          TEXT NOT NULL,
  customer_offer   INTEGER NOT NULL,
  provider_counter INTEGER,
  final_price      INTEGER,
  status           TEXT NOT NULL DEFAULT 'customer_offer',            -- customer_offer | provider_counter | accepted | rejected
  expires_at       TIMESTAMPTZ,
  messages         JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Broadcast Requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_requests (
  id                  TEXT PRIMARY KEY,
  customer_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  customer_name       TEXT NOT NULL,
  service             TEXT NOT NULL,
  service_label       TEXT NOT NULL,
  service_icon        TEXT DEFAULT 'tool',
  description         TEXT,
  video_url           TEXT,
  address             TEXT NOT NULL,
  latitude            REAL,
  longitude           REAL,
  scheduled_date      TEXT NOT NULL,
  scheduled_time      TEXT NOT NULL,
  customer_offer      INTEGER,
  status              TEXT NOT NULL DEFAULT 'open',                   -- open | accepted | cancelled | expired
  accepted_response_id TEXT,
  booking_id          TEXT,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broadcast_requests_status_idx      ON broadcast_requests (status);
CREATE INDEX IF NOT EXISTS broadcast_requests_customer_id_idx ON broadcast_requests (customer_id);
CREATE INDEX IF NOT EXISTS broadcast_requests_expires_at_idx  ON broadcast_requests (expires_at);

-- ─── Broadcast Responses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_responses (
  id             TEXT PRIMARY KEY,
  request_id     TEXT NOT NULL REFERENCES broadcast_requests (id) ON DELETE CASCADE,
  provider_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  provider_offer INTEGER,
  message        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',                     -- pending | accepted_by_customer | rejected_by_customer | withdrawn
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Chats ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chats (
  id               TEXT PRIMARY KEY,
  participant1_id  TEXT NOT NULL,
  participant2_id  TEXT NOT NULL,
  participant1_name TEXT NOT NULL,
  participant2_name TEXT NOT NULL,
  booking_id       TEXT,
  service          TEXT,
  last_message     TEXT,
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL,
  sender_id   TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_chat_id_idx   ON messages (chat_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages (sender_id);

-- ─── Calls ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calls (
  id                TEXT PRIMARY KEY,
  caller_id         TEXT NOT NULL,
  caller_name       TEXT NOT NULL,
  receiver_id       TEXT NOT NULL,
  caller_initials   TEXT NOT NULL DEFAULT '??',
  caller_color      TEXT DEFAULT '#1A6EE0',
  service           TEXT,
  status            TEXT NOT NULL DEFAULT 'ringing',                  -- ringing | ongoing | ended | missed | rejected
  offer             TEXT,
  answer            TEXT,
  caller_candidates TEXT DEFAULT '[]',
  callee_candidates TEXT DEFAULT '[]',
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Saved Addresses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_addresses (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  label      TEXT NOT NULL,
  address    TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'map-pin',
  is_default BOOLEAN DEFAULT FALSE,
  latitude   REAL,
  longitude  REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Saved Providers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_providers (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',                            -- info | broadcast | booking | system | promotion
  link       TEXT,
  data       JSONB,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications (is_read);

-- ─── Admin Broadcasts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  audience        TEXT NOT NULL DEFAULT 'all',                        -- all | customer | provider
  created_by      TEXT NOT NULL,
  created_by_name TEXT,
  sent_count      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Admin Notifications ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  message          TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'info',
  link             TEXT,
  target_admin_id  TEXT,
  read_by_admin_ids JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  admin_role TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  target_id  TEXT,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Support Tickets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id),
  user_name       TEXT NOT NULL,
  user_phone      TEXT NOT NULL,
  user_role       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  message         TEXT NOT NULL,
  booking_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'open',                       -- open | in_progress | resolved | closed
  priority        TEXT NOT NULL DEFAULT 'normal',                     -- low | normal | high | urgent
  admin_notes     TEXT,
  resolution_note TEXT,
  assigned_to     TEXT,
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx  ON support_tickets (status);

-- ─── Ticket Notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_notes (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES support_tickets (id),
  admin_id    TEXT NOT NULL,
  admin_name  TEXT NOT NULL,
  note        TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Provider Documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_documents (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type           TEXT NOT NULL,                                       -- cnic_front | cnic_back | license | selfie | other
  label          TEXT,
  url            TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',                     -- pending | approved | rejected
  rejection_note TEXT,
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Commission Payments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_payments (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  account_id     TEXT,
  reference      TEXT,
  screenshot_url TEXT,
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',                     -- pending | approved | rejected
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  rejection_note TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Service Add Requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_add_requests (
  id                  TEXT PRIMARY KEY,
  provider_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  service_category_id TEXT,
  service_name        TEXT NOT NULL,
  documents           JSONB DEFAULT '[]',
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',                -- pending | approved | rejected
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  rejection_note      TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Subscription Plans ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  audience      TEXT NOT NULL DEFAULT 'provider',                     -- provider | customer | both
  price_monthly INTEGER DEFAULT 0,
  price_yearly  INTEGER DEFAULT 0,
  features      JSONB DEFAULT '[]',
  is_active     BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── User Subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL REFERENCES subscription_plans (id),
  billing_period    TEXT NOT NULL DEFAULT 'monthly',                  -- monthly | yearly
  status            TEXT NOT NULL DEFAULT 'pending',                  -- pending | active | expired | cancelled
  amount            INTEGER NOT NULL,
  payment_reference TEXT,
  screenshot_url    TEXT,
  started_at        TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  rejection_note    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Account Deletion Requests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason              TEXT,
  requested_at        TIMESTAMPTZ DEFAULT NOW(),
  scheduled_delete_at TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',                -- pending | cancelled | completed
  cancelled_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Email Change Requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_change_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_email  TEXT NOT NULL,
  otp_code   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Phone Change Requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_change_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_phone  TEXT NOT NULL,
  otp_code   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Promotions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  description       TEXT,
  discount_type     TEXT NOT NULL DEFAULT 'percentage',               -- percentage | fixed
  discount_value    INTEGER NOT NULL,
  max_uses          INTEGER,
  used_count        INTEGER DEFAULT 0,
  min_booking_value INTEGER,
  valid_from        TIMESTAMPTZ,
  valid_until       TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT TRUE,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Refund Requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refund_requests (
  id               TEXT PRIMARY KEY,
  booking_id       TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  customer_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  amount_requested INTEGER NOT NULL,
  evidence_url     TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',                   -- pending | approved | rejected
  resolution_note  TEXT,
  resolved_by      TEXT,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Withdrawal Requests ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id               TEXT PRIMARY KEY,
  provider_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount           INTEGER NOT NULL,
  bank_name        TEXT,
  account_title    TEXT NOT NULL,
  account_number   TEXT NOT NULL,
  iban             TEXT,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',                   -- pending | approved | rejected | paid
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  rejection_note   TEXT,
  paid_at          TIMESTAMPTZ,
  payment_reference TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Marketing Banners ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_banners (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  image_url       TEXT,
  bg_color_from   TEXT DEFAULT '#1A6EE0',
  bg_color_to     TEXT DEFAULT '#0D4BA0',
  icon_name       TEXT DEFAULT 'star',
  link_type       TEXT DEFAULT 'none',                                -- none | category | url | booking
  link_target     TEXT,
  target_audience TEXT DEFAULT 'all',                                 -- all | customer | provider
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── App Announcements ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_announcements (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  button_text     TEXT DEFAULT 'Got it',
  button_link     TEXT,
  image_url       TEXT,
  target_audience TEXT DEFAULT 'all',                                 -- all | customer | provider
  is_active       BOOLEAN DEFAULT TRUE,
  show_once       BOOLEAN DEFAULT TRUE,
  priority        INTEGER DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FAQs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faqs (
  id              TEXT PRIMARY KEY,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  category        TEXT DEFAULT 'general',                             -- general | booking | payment | technical | safety
  target_audience TEXT DEFAULT 'all',                                 -- all | customer | provider
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Reviews ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id                  TEXT PRIMARY KEY,
  booking_id          TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  reviewer_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewer_name       TEXT NOT NULL,
  reviewed_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewed_name       TEXT NOT NULL,
  rating              INTEGER NOT NULL,                               -- 1-5
  review              TEXT,
  is_disputed         BOOLEAN DEFAULT FALSE,
  dispute_note        TEXT,
  dispute_resolved_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  invoice_number  TEXT NOT NULL UNIQUE,                               -- ATH-000001
  booking_id      TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  customer_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  customer_name   TEXT NOT NULL,
  provider_name   TEXT NOT NULL,
  service         TEXT NOT NULL,
  address         TEXT NOT NULL,
  scheduled_date  TEXT NOT NULL,
  scheduled_time  TEXT NOT NULL,
  subtotal        INTEGER NOT NULL,
  visit_charge    INTEGER DEFAULT 0,
  platform_fee    INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  total_amount    INTEGER NOT NULL,
  commission_amount INTEGER DEFAULT 0,
  provider_amount INTEGER NOT NULL,
  pdf_url         TEXT,
  status          TEXT DEFAULT 'issued',                              -- issued | paid | disputed | cancelled
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Report Issues ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_issues (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT REFERENCES bookings (id) ON DELETE SET NULL,
  reporter_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_role TEXT NOT NULL,                                        -- customer | provider
  reported_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  reported_name TEXT,
  category      TEXT NOT NULL,                                        -- fraud | behavior | quality | payment | other
  description   TEXT NOT NULL,
  status        TEXT DEFAULT 'open',                                  -- open | under_review | resolved | dismissed
  admin_note    TEXT,
  resolved_by   TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Hourly Rate Requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hourly_rate_requests (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  service        TEXT NOT NULL,
  current_rate   INTEGER,
  requested_rate INTEGER NOT NULL,
  reason         TEXT,
  status         TEXT DEFAULT 'pending',                              -- pending | approved | rejected
  reviewed_by    TEXT,
  review_note    TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Notification Templates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL,                                      -- push | sms | email
  target_audience TEXT DEFAULT 'all',                                 -- all | customer | provider
  subject         TEXT,
  body            TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Login History ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users (id) ON DELETE CASCADE,
  phone       TEXT,
  email       TEXT,
  role        TEXT,
  method      TEXT NOT NULL,                                          -- otp | password | biometric
  success     BOOLEAN NOT NULL,
  fail_reason TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── User Blocks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  id         TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Admin Blacklist ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_blacklist (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,                                           -- phone | email
  value      TEXT NOT NULL,
  reason     TEXT,
  added_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Emergency Contacts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  number      TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT 'phone-call',
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- END OF SCHEMA
-- Total tables: 44
-- ============================================================
