# ATHOO Deployment Guide

Deploy ATHOO on **Render** (backend + admin panel) and **Neon** (PostgreSQL).

---

## Overview

| Service      | Platform          | Type              |
|--------------|-------------------|-------------------|
| API Server   | Render Web Service | Node.js           |
| Admin Panel  | Render Static Site | React/Vite build  |
| Database     | Neon              | Serverless Postgres|
| File Storage | Replit Object Storage | S3-compatible  |
| Mobile App   | Expo EAS Build    | APK / IPA         |

---

## Step 1 — Neon Database

1. Sign up at [neon.tech](https://neon.tech) and create a project named `athoo`.
2. Copy your **Connection String** (looks like `postgresql://user:pass@host/dbname?sslmode=require`).
3. Open the **SQL Editor** in the Neon dashboard.
4. Run **`sql/database.sql`** (full fresh schema).
5. Run **`sql/seed.sql`** (default categories, payment accounts, platform settings).

> **Upgrading an existing DB?** Run `sql/production_sql_patch.sql` instead of `database.sql`.

---

## Step 2 — Render: API Server

### Create Web Service

1. Go to [render.com](https://render.com) → New → **Web Service**.
2. Connect your GitHub repo.
3. Set **Root Directory**: *(leave blank — monorepo root)*

### Build & Start Commands

| Field | Value |
|-------|-------|
| **Build Command** | `corepack enable && pnpm install && pnpm --filter @workspace/api-server run build` |
| **Start Command** | `pnpm --filter @workspace/api-server start` |
| **Runtime** | Node |
| **Plan** | Starter (512 MB RAM minimum) |

### Environment Variables (API Server)

Set these in Render → Environment:

```
NODE_ENV=production
PORT=10000
DATABASE_URL=<your neon connection string>
PGSSLMODE=require
JWT_SECRET=<64-char random hex>
SESSION_SECRET=<64-char random hex>
CORS_ORIGIN=https://your-admin-panel.onrender.com
DEFAULT_OBJECT_STORAGE_BUCKET_ID=<from Replit>
PRIVATE_OBJECT_DIR=<from Replit>
PUBLIC_OBJECT_SEARCH_PATHS=<from Replit>
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Health Check

Set the health check path to `/api/healthz`.

---

## Step 3 — Render: Admin Panel

### Create Static Site

1. Render → New → **Static Site**.
2. Connect same GitHub repo.

| Field | Value |
|-------|-------|
| **Build Command** | `corepack enable && pnpm install && pnpm --filter @workspace/admin-panel run build` |
| **Publish Directory** | `artifacts/admin-panel/dist/public` |

### Environment Variables (Admin Panel)

```
VITE_API_URL=https://your-api-server.onrender.com
```

> The admin panel proxies all `/api` requests through Vite in dev. In production, set `VITE_API_URL` to your Render API server URL.

---

## Step 4 — Mobile App (Expo EAS)

### One-time setup
```bash
npm install -g eas-cli
eas login
eas build:configure
```

### Update API URL
In `artifacts/athoo-app/services/api.ts`, update `BASE_URL` to your production API server URL.

### Build APK (Android)
```bash
pnpm --filter @workspace/athoo-app run build:android
# or
eas build --platform android --profile preview
```

### Build IPA (iOS)
```bash
eas build --platform ios --profile preview
```

---

## Step 5 — Post-Deployment Verification

Run these checks after deploying:

```bash
# API health
curl https://your-api.onrender.com/api/healthz

# Public settings
curl https://your-api.onrender.com/api/settings/public

# Categories
curl https://your-api.onrender.com/api/categories
```

Expected: JSON responses with no errors.

---

## Deployment Checklist

- [ ] Neon DB created and schema applied
- [ ] Seed data inserted (categories, payment accounts, settings)
- [ ] API server deployed on Render with all env vars
- [ ] Health check passing at `/api/healthz`
- [ ] Admin panel deployed and reachable
- [ ] Admin panel can connect to API (test login)
- [ ] Mobile app `BASE_URL` points to production API
- [ ] Expo build generated (APK/IPA)
- [ ] Demo login works for all three roles
- [ ] Payment accounts visible in provider app
- [ ] Booking flow end-to-end tested

---

## Common Issues

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` on DB | Check `DATABASE_URL` includes `?sslmode=require` and `PGSSLMODE=require` |
| Admin panel blank | Verify `VITE_API_URL` is set and CORS_ORIGIN includes the admin panel domain |
| File uploads failing | Set all three `OBJECT_STORAGE_*` env vars from Replit |
| 401 on all API calls | `JWT_SECRET` mismatch between old tokens and new deployment |
| Mobile can't connect | Ensure `BASE_URL` in `api.ts` uses `https://`, not `http://` |
