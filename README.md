# ATHOO — Pakistan Home Services Marketplace

ATHOO connects customers with trusted home-service professionals (plumbers, electricians, carpenters, AC technicians, and more) across Pakistan. Full-stack monorepo: React Native mobile app + React admin panel + Express REST API + PostgreSQL.

---

## Project Structure

```
athoo/
├── artifacts/
│   ├── api-server/       # Express 5 + Drizzle ORM backend
│   ├── admin-panel/      # React + Vite admin dashboard (Wouter)
│   └── athoo-app/        # Expo ~54 + Expo Router ~6 mobile app
├── lib/
│   ├── db/               # Drizzle schema (44 tables)
│   ├── api-spec/         # OpenAPI contract
│   ├── api-zod/          # Generated Zod validators
│   └── api-client-react/ # Generated React Query hooks
├── scripts/
│   └── src/seed.ts       # Database seeding script
└── sql/
    ├── database.sql               # Full idempotent schema — fresh install
    ├── seed.sql                   # Demo + default data
    └── production_sql_patch.sql   # Safe upgrade patch for existing DBs
```

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm` or `corepack enable`)
- PostgreSQL 15+ (local) or a [Neon](https://neon.tech) serverless database

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
# API server (required)
cp artifacts/api-server/.env.example artifacts/api-server/.env

# Mobile app
cp artifacts/athoo-app/.env.example artifacts/athoo-app/.env

# Admin panel (usually not needed — auto-detects origin)
cp artifacts/admin-panel/.env.example artifacts/admin-panel/.env
```

Edit `artifacts/api-server/.env` and set at minimum:
- `DATABASE_URL` — your PostgreSQL connection string
- `SESSION_SECRET` — any long random string (64+ chars)

### 3. Set up the database

**Fresh install:**
```bash
psql $DATABASE_URL < sql/database.sql
psql $DATABASE_URL < sql/seed.sql     # optional demo data
```

**Existing database upgrade (idempotent — safe to re-run):**
```bash
psql $DATABASE_URL < sql/production_sql_patch.sql
```

**Via Drizzle (alternative):**
```bash
pnpm --filter @workspace/db run push
```

### 4. Start services

Each service runs independently:

```bash
# API server (Express 5 + PostgreSQL)  →  http://localhost:8080
pnpm --filter @workspace/api-server run dev

# Admin panel (React + Vite)           →  http://localhost:5173
pnpm --filter @workspace/admin-panel run dev

# Mobile app (Expo)                    →  Expo Go / simulator
pnpm --filter @workspace/athoo-app run dev
```

---

## Environment Variables

### API Server (`artifacts/api-server/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | JWT signing secret (64+ random chars) |
| `NODE_ENV` | — | `development` or `production` |
| `PORT` | — | Server port (default `8080`) |
| `CORS_ORIGIN` | — | Allowed origins (`*` for dev) |
| `SMTP_HOST` | — | SMTP host (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | — | SMTP port (`465` for SSL, `587` for TLS) |
| `SMTP_USER` | — | SMTP username / email |
| `SMTP_PASS` | — | SMTP password / app password |
| `SMTP_FROM` | — | Sender string e.g. `ATHOO <no-reply@athoo.pk>` |
| `CLOUDINARY_CLOUD_NAME` | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | — | Cloudinary API secret |
| `EXPO_ACCESS_TOKEN` | — | Expo EAS access token for push |
| `WHATSAPP_ACCESS_TOKEN` | — | Meta Business Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Meta WhatsApp phone number ID |

When `SMTP_PASS` is not set, OTP codes are printed to the server console (dev-safe fallback).  
When `CLOUDINARY_*` vars are not set, the file upload endpoint returns an error.

### Mobile App (`artifacts/athoo-app/.env`)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Yes* | Full API URL e.g. `http://localhost:8080` |
| `EXPO_PUBLIC_PROJECT_ID` | Yes | Expo project UUID from expo.dev |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Yes | Google Maps / Places API key |
| `EXPO_PUBLIC_DISABLE_PUSH` | — | `true` to skip push in Expo Go |

*On Replit, `EXPO_PUBLIC_DOMAIN` is injected automatically so `EXPO_PUBLIC_API_BASE_URL` is not needed.

### Admin Panel (`artifacts/admin-panel/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | — | API URL override (auto-detected from `window.location.origin`) |

---

## Demo Credentials

| Role          | Phone / Email   | Password  |
|---------------|-----------------|-----------|
| Super Admin   | 03000000001     | Admin@123 |
| Demo Customer | 03000000002     | Demo@123  |
| Demo Provider | 03000000004     | Demo@123  |

Admin panel login: `admin@athoo.com` / `Admin@123`

---

## Tech Stack

| Layer        | Technology |
|---|---|
| Mobile       | Expo ~54, React Native, Expo Router ~6, Socket.IO client |
| Admin Panel  | React 18, Vite, Wouter, TanStack Query v5, Tailwind CSS |
| API Server   | Express 5, Drizzle ORM, PostgreSQL, Socket.IO |
| Database     | PostgreSQL 15 (Neon recommended for production) |
| File Storage | Cloudinary (signed upload — no server-side proxy) |
| Auth         | JWT Bearer tokens, bcrypt, OTP via email / console |
| Push         | Expo Push Notifications (authenticated via EXPO_ACCESS_TOKEN) |
| Maps         | Google Maps SDK + Places API + Geocoding API |
| Real-time    | Socket.IO — booking events, calls, chat, notifications |

---

## Key Features

**Customer:** Browse 12+ service categories · Book providers · Live GPS tracking · InDrive-style broadcast requests · Price negotiation · In-app voice calls & chat · Favourites · Reviews · Saved addresses · Google Maps address search

**Provider:** Accept/reject bookings · OTP PIN job start/end · GPS sharing · Commission tracking & payment submission · Broadcast request browsing

**Admin:** User management · Provider verification · Booking oversight · Commission management · Payment accounts · Subscription plans · Notifications · Categories & service areas · Audit log · Promotions · Refunds & withdrawals · Blacklist

---

## Production Deployment

See [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for full Render + Neon deployment instructions.

**Quick checklist:**
1. Provision a PostgreSQL database (Neon, Railway, Supabase, etc.)
2. Run `sql/database.sql` on the fresh database
3. Set all required environment variables on your hosting platform
4. Deploy `artifacts/api-server` as a Node.js web service
5. Deploy `artifacts/admin-panel` as a static site (build: `pnpm build`, publish dir: `dist`)
6. Build the Expo mobile app with `eas build` using your `EXPO_ACCESS_TOKEN`

---

## External Services Required for Production

| Service | Purpose | Sign-up |
|---|---|---|
| PostgreSQL | Primary database | [neon.tech](https://neon.tech) (free tier) |
| Cloudinary | File / image storage | [cloudinary.com](https://cloudinary.com) (free tier) |
| Gmail / SMTP | OTP + password reset emails | [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |
| Google Maps | Address search, maps in app | [console.cloud.google.com](https://console.cloud.google.com) |
| Expo EAS | Mobile app builds + push | [expo.dev](https://expo.dev) |
| Meta WhatsApp | OTP via WhatsApp (optional) | [developers.facebook.com](https://developers.facebook.com) |

---

## Documentation

| Guide | Description |
|---|---|
| [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Render + Neon full deployment |
| [DATABASE_GUIDE.md](docs/DATABASE_GUIDE.md) | Schema setup, migrations, Neon SQL |
| [ENVIRONMENT_GUIDE.md](docs/ENVIRONMENT_GUIDE.md) | All environment variables |
