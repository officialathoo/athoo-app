# ATHOO — Deployment Guide

This guide covers deploying ATHOO on the recommended stack:
- **Database**: Neon (managed PostgreSQL)
- **API Server**: Render (Web Service)
- **Admin Panel**: Render (Static Site) or Vercel
- **Mobile**: Expo EAS Build → Google Play + App Store

---

## Step 1 — Database (Neon)

1. Create account at [neon.tech](https://neon.tech)
2. Create a new project → name it `athoo`
3. Copy the **Connection String** (pooled) from the dashboard
4. It looks like: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

Push the schema from your local machine:
```bash
DATABASE_URL="<your-neon-url>" pnpm db:push
```

Seed initial data:
```bash
DATABASE_URL="<your-neon-url>" pnpm db:seed
```

---

## Step 2 — API Server (Render)

### Create Web Service

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repository
3. Configure:

| Setting | Value |
|---|---|
| Name | athoo-api |
| Root Directory | `artifacts/api-server` |
| Runtime | Node |
| Build Command | `pnpm install --filter @workspace/api-server && pnpm --filter @workspace/api-server run build` |
| Start Command | `pnpm --filter @workspace/api-server run start` |
| Instance Type | Starter ($7/mo) or higher |

### Environment Variables (add in Render dashboard)

```
NODE_ENV=production
PORT=10000
DATABASE_URL=<your-neon-connection-string>
JWT_SECRET=<64+ random chars>
SESSION_SECRET=<64+ random chars>
CORS_ORIGIN=https://your-admin-panel.onrender.com,https://your-app-domain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=ATHOO <noreply@athoo.pk>
```

Add optional env vars as available (WhatsApp, S3, payment keys).

### Generate Secure Secrets

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run twice — use one for JWT_SECRET, one for SESSION_SECRET.

### Health Check

After deploy, verify: `https://your-api.onrender.com/api/healthz`

Expected response: `{"status":"ok"}`

---

## Step 3 — Admin Panel (Render Static Site)

1. Render → New → Static Site
2. Connect repository
3. Configure:

| Setting | Value |
|---|---|
| Name | athoo-admin |
| Root Directory | `artifacts/admin-panel` |
| Build Command | `pnpm install && pnpm --filter @workspace/admin-panel run build` |
| Publish Directory | `artifacts/admin-panel/dist` |

The admin panel is a pure SPA — it calls your API via relative `/api/...` paths. If hosting on a separate domain, set the API base URL in `artifacts/admin-panel/src/lib/api.ts`.

### SPA Redirect Rule

In Render → Static Site → Redirects, add:
```
Source:  /*
Destination: /index.html
Status: 200
```

---

## Step 4 — Admin Panel (Vercel — alternative)

1. Import project at [vercel.com](https://vercel.com)
2. Set Root Directory: `artifacts/admin-panel`
3. Framework: Vite
4. Build Command: `pnpm install && pnpm run build`
5. Output Directory: `dist`

---

## Step 5 — Mobile App (Expo EAS)

### Prerequisites

```bash
npm install -g eas-cli
eas login
```

### Configure eas.json

Create `artifacts/athoo-app/eas.json`:
```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "production": {
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    }
  }
}
```

### Set API URL

Create `artifacts/athoo-app/.env.production`:
```
EXPO_PUBLIC_API_BASE_URL=https://your-api.onrender.com
```

### Build

```bash
cd artifacts/athoo-app

# Android
eas build --platform android --profile production

# iOS (requires Apple Developer account)
eas build --platform ios --profile production
```

### Push to Stores

```bash
# Google Play
eas submit --platform android

# Apple App Store
eas submit --platform ios
```

---

## Step 6 — Custom Domain (Optional)

### API on render.com
- Render → Your service → Settings → Custom Domains
- Add `api.athoo.pk` and configure DNS CNAME

### Admin Panel
- Same process — add `admin.athoo.pk`

### After adding domains, update:
1. `CORS_ORIGIN` env var on Render to include the new domain
2. `EXPO_PUBLIC_API_BASE_URL` in the mobile app `.env.production`
3. Rebuild and redeploy

---

## GitHub Repository Setup

To push your Replit project to GitHub:

1. Create a new **private** GitHub repository (no README, no .gitignore)
2. In Replit shell:

```bash
git remote add origin https://github.com/YOUR_USERNAME/athoo.git
git branch -M main
git push -u origin main
```

3. Set Render to auto-deploy on push to `main`

---

## Environment Variable Checklist

Required on the API server:

- [x] `NODE_ENV=production`
- [x] `PORT` (Render auto-sets this)
- [x] `DATABASE_URL`
- [x] `JWT_SECRET` (64+ random chars)
- [x] `SESSION_SECRET` (64+ random chars)
- [x] `CORS_ORIGIN`

Strongly recommended:

- [ ] `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` (for OTP emails)
- [ ] `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (for WhatsApp OTP)

Optional:

- [ ] `S3_*` variables (for file uploads beyond base64)
- [ ] `EXPO_ACCESS_TOKEN` (for EAS CI builds)

---

## Post-Deployment Verification

Run these after every deployment:

```bash
# Health
curl https://your-api.onrender.com/api/healthz

# Deep health (DB ping)
curl https://your-api.onrender.com/api/healthz/deep

# Admin login
curl -X POST https://your-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@athoo.com","password":"Admin@123"}'
```

The login response must include a `token` field.

---

## Maintenance

### Database Migrations

Whenever you update the schema (`lib/db/src/schema/index.ts`):

```bash
DATABASE_URL="<prod-url>" pnpm db:push
```

Drizzle uses safe `push` (no data loss) unless columns are removed.

### Rolling Back

Render keeps previous deploys. Use the Render dashboard → Deploys → Rollback to revert instantly.
