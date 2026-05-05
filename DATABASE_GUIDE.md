# ATHOO — Database Guide

Complete reference for the ATHOO PostgreSQL schema, migrations, seeding, and maintenance.

---

## Overview

ATHOO uses **PostgreSQL** with **Drizzle ORM** for type-safe queries. The schema is defined in `lib/db/src/schema/index.ts` and consists of **44 tables** covering the full home-services marketplace domain.

---

## Quick Start

### Fresh Database

```bash
# 1. Push Drizzle schema (creates all tables + indexes)
DATABASE_URL="postgresql://..." pnpm db:push

# 2. Seed default data (admin, categories, service areas, FAQs, etc.)
DATABASE_URL="postgresql://..." pnpm db:seed
```

### Existing Database (Production Upgrade)

```bash
# Run the safe patch script — adds columns/tables with IF NOT EXISTS,
# never drops anything, safe to re-run
psql "$DATABASE_URL" -f production_sql_patch.sql
```

---

## Files

| File | Purpose |
|---|---|
| `database.sql` | Complete CREATE TABLE script for fresh deployments |
| `production_sql_patch.sql` | Safe ALTER TABLE / CREATE TABLE patches for upgrades |
| `seed.sql` | SQL seed for demo data (alternative to `pnpm db:seed`) |
| `lib/db/src/schema/index.ts` | Drizzle ORM schema (source of truth) |
| `scripts/src/seed.ts` | TypeScript seed script (`pnpm db:seed`) |

---

## Schema Overview (44 tables)

### Users & Auth
| Table | Description |
|---|---|
| `users` | All users (admin, provider, customer) with full KYC, preferences, commission tracking |
| `otps` | OTP codes for phone-based login |
| `login_history` | Login attempts log (success/fail, method, IP) |
| `email_change_requests` | Email change OTP verification flow |
| `phone_change_requests` | Phone change OTP verification flow |

### Bookings
| Table | Description |
|---|---|
| `bookings` | All job bookings with full lifecycle, geo tracking, OTP pins, commission |
| `broadcast_requests` | InDrive-style job posts sent to all nearby providers |
| `broadcast_responses` | Provider responses (offers) to broadcast requests |
| `negotiations` | Bilateral price negotiation threads |
| `reviews` | Standalone review records (linked to bookings) |
| `invoices` | Auto-generated invoices per completed booking |

### Communication
| Table | Description |
|---|---|
| `chats` | Chat conversations between provider/customer pairs |
| `messages` | Individual chat messages |
| `calls` | WebRTC VoIP call sessions (offer/answer/candidates) |
| `notifications` | In-app push notifications for users |
| `admin_broadcasts` | Admin broadcast messages |
| `admin_notifications` | Internal admin notification inbox |

### Finance
| Table | Description |
|---|---|
| `commission_payments` | Provider commission payment submissions with screenshot proof |
| `payment_accounts` | Platform bank/mobile-money accounts for receiving commission |
| `withdrawal_requests` | Provider payout withdrawal requests |
| `refund_requests` | Customer refund/dispute requests |
| `promotions` | Discount codes with usage limits and validity windows |
| `subscription_plans` | Premium subscription plan definitions |
| `user_subscriptions` | User subscription records |

### Provider Management
| Table | Description |
|---|---|
| `provider_documents` | KYC verification document records |
| `service_add_requests` | Provider requests to add new services to their profile |
| `hourly_rate_requests` | Provider requests to change their hourly rate |
| `saved_providers` | Customer favorites (saved providers) |

### Platform Config
| Table | Description |
|---|---|
| `service_categories` | Admin-managed service categories |
| `service_areas` | Cities/areas where ATHOO operates |
| `app_settings` | Key-value platform settings (commission rate, visit charge, etc.) |
| `marketing_banners` | Promotional banners for app home screens |
| `app_announcements` | Modal announcements shown on app open |
| `faqs` | FAQ content for Help screens |
| `emergency_contacts` | Emergency numbers shown in app |
| `notification_templates` | Customizable push/SMS notification templates |

### Admin Tools
| Table | Description |
|---|---|
| `audit_log` | Immutable log of every admin action |
| `admin_blacklist` | Banned phones and emails |
| `support_tickets` | Customer/provider support requests |
| `ticket_notes` | Admin internal notes on tickets |
| `user_blocks` | User-initiated blocks between accounts |

### User Lifecycle
| Table | Description |
|---|---|
| `saved_addresses` | User saved delivery/service addresses |
| `account_deletion_requests` | 7-day grace period deletion flow |

---

## Drizzle ORM Usage

### Running Queries

```typescript
import { db } from "@workspace/db";
import { usersTable, bookingsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

// Find a user
const user = await db.query.usersTable.findFirst({
  where: eq(usersTable.phone, "03001234567"),
});

// Get provider bookings
const bookings = await db
  .select()
  .from(bookingsTable)
  .where(
    and(
      eq(bookingsTable.providerId, providerId),
      eq(bookingsTable.status, "completed"),
    )
  )
  .orderBy(desc(bookingsTable.createdAt));
```

### Pushing Schema Changes

After editing `lib/db/src/schema/index.ts`:

```bash
# Development (destructive is OK)
pnpm db:push

# Production (generate a migration first, review it)
pnpm --filter @workspace/db run generate
# Review the generated SQL, then apply
psql "$DATABASE_URL" -f <migration-file>
```

---

## Key Design Decisions

### Text IDs
All primary keys use `TEXT` with UUID values (`crypto.randomUUID()`). This avoids auto-increment lock contention and works well with distributed insertion.

### Public Booking IDs
Bookings have both an internal UUID `id` and a human-readable `public_id` (format: `ATH-YYYYMMDD-NNNNN`). Use `public_id` in user-facing screens and customer support.

### Commission Tracking
- `users.pending_commission` — accumulated unpaid commission (PKR)
- `users.total_commission` — total commission paid to date (PKR)
- `users.commission_limit` — threshold at which the provider is blocked from accepting jobs (default PKR 5,000)
- `commission_payments` — records of provider payment submissions

### Rating Storage
Ratings are stored denormalized on `users` as `rating` (sum) and `rating_count`. The displayed star rating = `rating / rating_count / 10.0` (since rating values are stored as integers, e.g. 45 = 4.5 stars).

### Booking State Machine
```
pending → accepted → in_progress → completed
   ↓          ↓           (no cancel from in_progress)
cancelled  cancelled
```
Job start and completion are gated by 3-minute OTP PINs.

### JSONB Columns
Several tables use `JSONB` for flexible data:
- `users.admin_permissions` — array of permission strings
- `users.services` — array of service names (also stored as `TEXT[]`)
- `negotiations.messages` — array of `NegotiationMessage` objects
- `app_settings.value` — the full platform settings object

---

## Indexes

All performance-critical query patterns are covered by indexes defined in the Drizzle schema:

- `users`: role, verification_status, is_available, is_blocked, referral_code, email, account_status
- `bookings`: customer_id, provider_id, status, created_at
- `otps`: phone, (used, expires_at)
- `messages`: chat_id, sender_id
- `notifications`: user_id, is_read
- `support_tickets`: user_id, status
- `broadcast_requests`: status, customer_id, expires_at

---

## Backup & Recovery

### Neon (Recommended)
- Enable automatic backups in: **Project Settings → Backups**
- Point-in-time recovery available on paid plans
- Use the pooled connection string for the app, direct for backups:
  ```bash
  pg_dump "$DIRECT_DATABASE_URL" > backup-$(date +%Y%m%d).sql
  ```

### Manual Backup
```bash
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --format=custom \
  -f "athoo-backup-$(date +%Y%m%d-%H%M%S).dump"
```

### Restore
```bash
pg_restore \
  --no-owner \
  --no-acl \
  -d "$DATABASE_URL" \
  athoo-backup-20260504-120000.dump
```

---

## Troubleshooting

### "Column does not exist" in production
Run `production_sql_patch.sql` — it adds all new columns safely:
```bash
psql "$DATABASE_URL" -f production_sql_patch.sql
```

### "Relation does not exist" in production
Run `database.sql` (if fresh DB) or `production_sql_patch.sql` (if upgrading):
```bash
psql "$DATABASE_URL" -f production_sql_patch.sql
```

### Health check
```bash
curl https://your-api.com/api/healthz/deep
# Expected: {"status":"ok","checks":{"database":{"ok":true,...}}}
```

### Check table row counts
```sql
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```
