---
name: testing-athoo-booking-flow
description: Test the Athoo booking/negotiation/invoice flow end-to-end. Use when verifying booking logic, broadcast flow, negotiation, invoice calculations, or admin panel changes.
---

# Testing Athoo Booking/Negotiation Flow

## Local Dev Setup

### 1. Database (PostgreSQL via Docker)
```bash
docker run -d --name athoo-pg -e POSTGRES_USER=athoo -e POSTGRES_PASSWORD=athootest -e POSTGRES_DB=athoo -p 5432:5432 postgres:16
```
Wait ~5s for postgres to start, then push schema:
```bash
DATABASE_URL="postgresql://athoo:athootest@localhost:5432/athoo" pnpm db:push
```

### 2. Seed Data
The database needs seed data for test users. Run:
```bash
DATABASE_URL="postgresql://athoo:athootest@localhost:5432/athoo" pnpm db:seed
```

### 3. API Server
```bash
DATABASE_URL="postgresql://athoo:athootest@localhost:5432/athoo" JWT_SECRET="dev-secret-key-12345" pnpm --filter api-server dev
```
Runs on port 5000.

### 4. Admin Panel
```bash
VITE_API_BASE_URL=http://localhost:5000 PORT=5173 pnpm --filter admin-panel dev
```
Runs on port 5173.

**Important**: The admin panel stores API base URL in localStorage key `athoo_admin_api`. If login fails with 404, set it via browser console:
```js
localStorage.setItem("athoo_admin_api", "http://localhost:5000");
```
Then refresh the page.

## Test Users

| Role | Phone | Password | Name |
|------|-------|----------|------|
| Admin | 03000000001 | Admin@123 | ATHOO Admin |
| Customer | 03000000002 | Demo@123 | Ali Hassan |
| Provider | 03000000004 | Demo@123 | Usman Malik (approved, available) |

## Getting Auth Tokens

```bash
# Customer token
curl -s http://localhost:5000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"03000000002","password":"Demo@123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"

# Provider token
curl -s http://localhost:5000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"03000000004","password":"Demo@123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"

# Admin token
curl -s http://localhost:5000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"03000000001","password":"Admin@123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
```

## API Testing Patterns

### Broadcast Flow (Tests 1 & 2)
1. **Create broadcast** (as customer): `POST /api/broadcast` with fields: `service`, `serviceLabel`, `address`, `lat`, `lng`, `scheduledDate`, `scheduledTime`, `customerOffer`, `customerRatePerHour`, `customerHours`, `customerTravelCharge`
2. **Provider responds**: `POST /api/broadcast/:id/respond` — use `acceptCustomerPrice=true` for direct accept, or send `providerOffer/providerRatePerHour/providerHours/providerTravelCharge` for counter
3. **Customer selects**: `POST /api/broadcast/:id/select/:responseId` — creates confirmed booking

### Negotiation Flow (Test 3)
1. **Create negotiation** (as customer): `POST /api/negotiations` with `providerId`, `service`, `customerOffer`, `customerName`, `providerName`
2. **Accept** (as provider): `PATCH /api/negotiations/:id/accept` — auto-creates confirmed booking

### Status Transitions (Test 4)
- `PATCH /api/bookings/:id/status` with `{"status": "provider_travelling"}`
- `POST /api/bookings/:id/arrived` — sets status to `provider_arrived`
- `PATCH /api/bookings/:id/status` with `{"status": "in_progress"}`
- `PATCH /api/bookings/:id/status` with `{"status": "completed"}`

### Invoice Verification (Test 6)
After completing a booking, check the booking object for:
- `ratePerHour`, `hours`, `travelCharge` — should match final agreed terms
- `commissionAmount` — percentage of serviceCharge only (not travel)
- `providerAmount` — customerTotal minus commission

## Key Assertions

- Booking status after selection/acceptance must be `"confirmed"` (NOT `"pending"`)
- Invoice must use final agreed terms, NOT customer's original or default Rs.200 visit charge
- Provider direct accept: `isDirectAccept=true`, booking uses customer's terms
- Provider counter-offer: booking uses provider's terms (ratePerHour, hours, travelCharge)
- Negotiation accept: auto-creates booking with `source="negotiation"`

## Admin Panel Testing

- Bookings page (`/bookings`): verify status filter dropdown includes Confirmed, Provider Travelling, Provider Arrived
- Live Jobs page (`/live-jobs`): queries with comma-separated statuses — verify bookings appear
- StatusBadge renders different colors for each status

## Known Gotchas

- If API server restarts with a different JWT_SECRET, all existing tokens become invalid. Re-login to get fresh tokens.
- Admin panel localStorage may cache stale API URL — always verify `athoo_admin_api` points to correct port.
- The admin bookings API supports comma-separated multi-status filtering (e.g. `?status=confirmed,provider_travelling`). Single status also works.

## Devin Secrets Needed

No external secrets required for local testing. All test credentials are seeded locally.
