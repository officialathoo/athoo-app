-- ============================================================
-- ATHOO — Production SQL Patch (Safe Upgrade Script)
-- Generated: 2026-05-04
-- ============================================================
-- Run this against an EXISTING production database to safely
-- add any columns or tables that may have been added since the
-- initial deployment. Uses IF NOT EXISTS everywhere — safe to
-- re-run multiple times without data loss.
-- ============================================================

-- ─── PATCH 001: Add public_id to bookings ────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS public_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_public_id_idx ON bookings (public_id);

-- ─── PATCH 002: Add no-show tracking to users ─────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS no_show_count   INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooldown_until  TIMESTAMPTZ;

-- ─── PATCH 003: Add geo fields to users ──────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude TEXT;

-- ─── PATCH 004: Add referral system to users ──────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code);

-- ─── PATCH 005: Add service radius to users ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_travel_distance_km INTEGER;

-- ─── PATCH 006: Add premium fields to users ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium        BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_plan_id   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;

-- ─── PATCH 007: Add account lifecycle fields to users ─────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status         TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_account_status_idx ON users (account_status);

-- ─── PATCH 008: Add preference fields to users ────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS language          TEXT DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified    BOOLEAN DEFAULT FALSE;

-- ─── PATCH 009: Add admin fields to users ─────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT '[]';

-- ─── PATCH 010: Add KYC fields to users ───────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS father_name  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cnic_number  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cnic_expiry  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob          TEXT;

-- ─── PATCH 011: Add commission payment tracking to users ──────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_commission          INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_commission            INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_limit            INTEGER DEFAULT 5000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_commission_payment_at  TIMESTAMPTZ;

-- ─── PATCH 012: Add blacklist fields to users ────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked     BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes    TEXT;
CREATE INDEX IF NOT EXISTS users_is_blocked_idx ON users (is_blocked);

-- ─── PATCH 013: Add push token to users ──────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- ─── PATCH 014: Add profile fields to users ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_color TEXT DEFAULT '#1A6EE0';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS services      TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS location      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email         TEXT;
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- ─── PATCH 015: Add rating fields to users ────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating       INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_jobs   INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rate_per_hour INTEGER;

-- ─── PATCH 016: Add booking payment fields ────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS received_at    TIMESTAMPTZ;

-- ─── PATCH 017: Add booking tracking fields ───────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rating_reminder_sent_at  TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_job_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_started_at           TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS category_slug            TEXT;

-- ─── PATCH 018: Add booking OTP/PIN fields ────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_pin              TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_pin_expires_at   TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS complete_pin           TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS complete_pin_expires_at TIMESTAMPTZ;

-- ─── PATCH 019: Add booking geo tracking ──────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS picked_lat         REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS picked_lng         REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_lat       REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_lng       REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_lat       REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_lng       REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_accuracy  REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_arrived_at TIMESTAMPTZ;

-- ─── PATCH 020: Add booking commission fields ─────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_amount INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_amount   INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_rate   INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS visit_charge      INTEGER DEFAULT 0;

-- ─── PATCH 021: Add negotiation expiry ───────────────────────────────────────
ALTER TABLE negotiations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ─── PATCH 022: Add service_categories fields ────────────────────────────────
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS name_ur                TEXT;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS platform_fee_pct       REAL DEFAULT 5;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS min_hourly_rate        INTEGER;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS max_hourly_rate        INTEGER;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS estimated_duration_hrs REAL;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS commission_pct         REAL DEFAULT 10;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS created_by             TEXT;

-- ─── PATCH 023: Add caller_color and caller_initials to calls ─────────────────
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_initials TEXT NOT NULL DEFAULT '??';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_color    TEXT DEFAULT '#1A6EE0';

-- ─── PATCH 024: Create broadcast_requests table ──────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_requests (
  id                   TEXT PRIMARY KEY,
  customer_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  customer_name        TEXT NOT NULL,
  service              TEXT NOT NULL,
  service_label        TEXT NOT NULL,
  service_icon         TEXT DEFAULT 'tool',
  description          TEXT,
  video_url            TEXT,
  address              TEXT NOT NULL,
  latitude             REAL,
  longitude            REAL,
  scheduled_date       TEXT NOT NULL,
  scheduled_time       TEXT NOT NULL,
  customer_offer       INTEGER,
  status               TEXT NOT NULL DEFAULT 'open',
  accepted_response_id TEXT,
  booking_id           TEXT,
  expires_at           TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broadcast_requests_status_idx      ON broadcast_requests (status);
CREATE INDEX IF NOT EXISTS broadcast_requests_customer_id_idx ON broadcast_requests (customer_id);
CREATE INDEX IF NOT EXISTS broadcast_requests_expires_at_idx  ON broadcast_requests (expires_at);

-- ─── PATCH 025: Create broadcast_responses table ─────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_responses (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL REFERENCES broadcast_requests (id) ON DELETE CASCADE,
  provider_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_offer INTEGER,
  message        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 026: Create marketing_banners table ───────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_banners (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  image_url       TEXT,
  bg_color_from   TEXT DEFAULT '#1A6EE0',
  bg_color_to     TEXT DEFAULT '#0D4BA0',
  icon_name       TEXT DEFAULT 'star',
  link_type       TEXT DEFAULT 'none',
  link_target     TEXT,
  target_audience TEXT DEFAULT 'all',
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 027: Create app_announcements table ───────────────────────────────
CREATE TABLE IF NOT EXISTS app_announcements (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  button_text     TEXT DEFAULT 'Got it',
  button_link     TEXT,
  image_url       TEXT,
  target_audience TEXT DEFAULT 'all',
  is_active       BOOLEAN DEFAULT TRUE,
  show_once       BOOLEAN DEFAULT TRUE,
  priority        INTEGER DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 028: Create faqs table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faqs (
  id              TEXT PRIMARY KEY,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  category        TEXT DEFAULT 'general',
  target_audience TEXT DEFAULT 'all',
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 029: Create service_areas table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS service_areas (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  province   TEXT,
  is_active  BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 030: Create reviews table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id                  TEXT PRIMARY KEY,
  booking_id          TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  reviewer_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewer_name       TEXT NOT NULL,
  reviewed_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewed_name       TEXT NOT NULL,
  rating              INTEGER NOT NULL,
  review              TEXT,
  is_disputed         BOOLEAN DEFAULT FALSE,
  dispute_note        TEXT,
  dispute_resolved_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 031: Create invoices table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id               TEXT PRIMARY KEY,
  invoice_number   TEXT NOT NULL UNIQUE,
  booking_id       TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  customer_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  customer_name    TEXT NOT NULL,
  provider_name    TEXT NOT NULL,
  service          TEXT NOT NULL,
  address          TEXT NOT NULL,
  scheduled_date   TEXT NOT NULL,
  scheduled_time   TEXT NOT NULL,
  subtotal         INTEGER NOT NULL,
  visit_charge     INTEGER DEFAULT 0,
  platform_fee     INTEGER DEFAULT 0,
  discount_amount  INTEGER DEFAULT 0,
  total_amount     INTEGER NOT NULL,
  commission_amount INTEGER DEFAULT 0,
  provider_amount  INTEGER NOT NULL,
  pdf_url          TEXT,
  status           TEXT DEFAULT 'issued',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 032: Create report_issues table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS report_issues (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT REFERENCES bookings (id) ON DELETE SET NULL,
  reporter_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
  reporter_role TEXT NOT NULL,
  reported_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  reported_name TEXT,
  category      TEXT NOT NULL,
  description   TEXT NOT NULL,
  status        TEXT DEFAULT 'open',
  admin_note    TEXT,
  resolved_by   TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 033: Create hourly_rate_requests table ────────────────────────────
CREATE TABLE IF NOT EXISTS hourly_rate_requests (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  service        TEXT NOT NULL,
  current_rate   INTEGER,
  requested_rate INTEGER NOT NULL,
  reason         TEXT,
  status         TEXT DEFAULT 'pending',
  reviewed_by    TEXT,
  review_note    TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 034: Create notification_templates table ──────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  channel         TEXT NOT NULL,
  target_audience TEXT DEFAULT 'all',
  subject         TEXT,
  body            TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 035: Create login_history table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS login_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users (id) ON DELETE CASCADE,
  phone       TEXT,
  email       TEXT,
  role        TEXT,
  method      TEXT NOT NULL,
  success     BOOLEAN NOT NULL,
  fail_reason TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 036: Create user_blocks table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  id         TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 037: Create admin_blacklist table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_blacklist (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  value      TEXT NOT NULL,
  reason     TEXT,
  added_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 038: Create emergency_contacts table ───────────────────────────────
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

-- ─── PATCH 039: Create saved_providers table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_providers (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 040: Create email_change_requests table ────────────────────────────
CREATE TABLE IF NOT EXISTS email_change_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_email  TEXT NOT NULL,
  otp_code   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 041: Create phone_change_requests table ────────────────────────────
CREATE TABLE IF NOT EXISTS phone_change_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_phone  TEXT NOT NULL,
  otp_code   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 042: Add admin_notifications.read_by_admin_ids ─────────────────────
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS read_by_admin_ids JSONB DEFAULT '[]';

-- ─── PATCH 043: Add bookings.service_icon ────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_icon TEXT NOT NULL DEFAULT 'tool';

-- ─── PATCH 044: Add subscription_plans.audience ──────────────────────────────
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'provider';

-- ─── PATCH 045: Add user_subscriptions.rejection_note ────────────────────────
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS rejection_note TEXT;

-- ─── PATCH 046: Add withdrawal_requests.payment_reference ────────────────────
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;

-- ─── PATCH 047: Create account_deletion_requests table ───────────────────────
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason              TEXT,
  requested_at        TIMESTAMPTZ DEFAULT NOW(),
  scheduled_delete_at TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  cancelled_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PATCH 048: Add missing indexes ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS users_verification_status_idx ON users (verification_status);
CREATE INDEX IF NOT EXISTS users_is_available_idx        ON users (is_available);
CREATE INDEX IF NOT EXISTS otps_phone_idx                ON otps (phone);
CREATE INDEX IF NOT EXISTS otps_used_expires_idx         ON otps (used, expires_at);
CREATE INDEX IF NOT EXISTS bookings_customer_id_idx      ON bookings (customer_id);
CREATE INDEX IF NOT EXISTS bookings_provider_id_idx      ON bookings (provider_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx           ON bookings (status);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx       ON bookings (created_at);
CREATE INDEX IF NOT EXISTS messages_chat_id_idx          ON messages (chat_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx        ON messages (sender_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx     ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx     ON notifications (is_read);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx   ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx    ON support_tickets (status);

-- ============================================================
-- PATCH COMPLETE — Safe to re-run
-- ============================================================
