# ATHOO Database Guide

Complete reference for the ATHOO PostgreSQL schema.

---

## Schema Overview

44 tables across 8 domains:

| Domain | Tables |
|--------|--------|
| **Users & Auth** | `users`, `otps`, `login_history`, `account_deletion_requests`, `email_change_requests`, `phone_change_requests` |
| **Services** | `service_categories`, `service_areas`, `service_add_requests`, `hourly_rate_requests` |
| **Bookings** | `bookings`, `negotiations`, `broadcast_requests`, `broadcast_responses`, `invoices` |
| **Payments** | `payment_accounts`, `commission_payments`, `withdrawal_requests`, `refund_requests`, `subscription_plans`, `user_subscriptions` |
| **Communication** | `chats`, `messages`, `calls`, `notifications`, `admin_notifications`, `notification_templates` |
| **Support** | `support_tickets`, `ticket_notes`, `report_issues` |
| **Admin** | `audit_log`, `admin_broadcasts`, `admin_blacklist` |
| **Content** | `marketing_banners`, `app_announcements`, `faqs`, `emergency_contacts`, `promotions`, `provider_documents`, `saved_providers`, `saved_addresses`, `reviews`, `user_blocks`, `app_settings` |

---

## Fresh Install

Run on a new Neon / PostgreSQL database:

```sql
-- 1. Create all tables
\i sql/database.sql

-- 2. Insert default data
\i sql/seed.sql
```

Or via `psql`:
```bash
psql $DATABASE_URL -f sql/database.sql
psql $DATABASE_URL -f sql/seed.sql
```

---

## Upgrade Existing Database

Safe to run on a live database — all statements use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`:

```bash
psql $DATABASE_URL -f sql/production_sql_patch.sql
```

---

## Using Drizzle (Development)

The schema source of truth is `lib/db/src/schema/index.ts`.

```bash
# Push schema changes to the database (dev/staging)
pnpm db:push

# Generate migration files (optional)
pnpm db:generate

# Run seed script
pnpm db:seed
```

---

## Key Table Details

### `users`

Central table for all roles. Role values: `customer` | `provider` | `admin`.

Important columns:
- `is_blocked` + `blocked_reason` — set automatically when `pending_commission >= commission_limit`
- `commission_limit` — per-provider limit (default 5000 PKR, overridable per user)
- `pending_commission` — accumulates with each completed booking; cleared on approved payment
- `verification_status` — `pending` → `in_process` → `approved` | `rejected`
- `is_premium` + `premium_plan_id` + `premium_expires_at` — subscription state
- `expo_push_token` — push notification token for mobile

### `bookings`

Status lifecycle: `pending` → `accepted` → `started` → `completed` | `cancelled` | `rejected`

Payment lifecycle (`payment_status`): `pending` → `paid` (customer marks) → `received` (provider confirms)

Commission is calculated at booking completion:
```
commissionAmount = price × commissionRate / 100
providerAmount   = price − commissionAmount
```
Provider's `pending_commission` is incremented; if it reaches `commission_limit`, `is_blocked = true`.

### `commission_payments`

Providers submit payment screenshots. On admin approval:
- `pending_commission` is decremented
- If it falls below `commission_limit`, `is_blocked` is reset to `false`

### `app_settings`

Single key-value row with key `platform` storing a JSON object:

```json
{
  "commissionRate": 10,
  "defaultCommissionLimit": 5000,
  "defaultVisitCharge": 200,
  "platformName": "Athoo",
  "supportPhone": "+92 339 0051068",
  "maintenanceMode": false,
  "broadcastTTLMinutes": 30
}
```

### `broadcast_requests`

InDrive-style job broadcasting. Customer posts → all nearby providers of that category receive the request → providers submit `broadcast_responses` → customer picks one → converts to `bookings`.

Expires after `broadcastTTLMinutes` (default 30 min).

### `provider_documents`

Document types: `cnic_front` | `cnic_back` | `license` | `selfie` | `video` | `diploma` | `police`

URLs are object-storage paths (not full URLs). Access via: `GET /api/storage?path=<url>`

---

## Indexes

Performance indexes are created on:
- `users`: `role`, `phone`, `email`, `verification_status`, `is_available`, `is_blocked`
- `bookings`: `customer_id`, `provider_id`, `status`, `created_at`
- `commission_payments`: `provider_id`, `status`
- `notifications`: `user_id`, `is_read`
- `support_tickets`: `user_id`, `status`
- `messages`: `chat_id`, `sender_id`
- `login_history`: `user_id`, `created_at`

---

## Neon SQL Editor Steps

1. Log in to [console.neon.tech](https://console.neon.tech)
2. Select your project → **SQL Editor**
3. Paste and run each SQL file in order:
   - `database.sql` (or `production_sql_patch.sql` for existing DBs)
   - `seed.sql`
4. Verify: `SELECT count(*) FROM service_categories;` → should return 12
5. Verify: `SELECT count(*) FROM service_areas;` → should return 12
6. Verify: `SELECT count(*) FROM subscription_plans;` → should return 3

---

## Backup

```bash
# Dump schema + data
pg_dump $DATABASE_URL > athoo_backup_$(date +%Y%m%d).sql

# Restore
psql $NEW_DATABASE_URL < athoo_backup_20260101.sql
```
