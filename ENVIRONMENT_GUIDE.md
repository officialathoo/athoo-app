# ATHOO — Environment Variables Guide

Complete reference for all environment variables used by the ATHOO platform.

---

## Overview

Environment variables are set in three places:

| Component | Method |
|---|---|
| **API Server** | `.env` file in `artifacts/api-server/` (dev) or hosting platform dashboard (prod) |
| **Admin Panel** | Vite build-time env vars prefixed `VITE_` |
| **Mobile App** | Expo env vars prefixed `EXPO_PUBLIC_` in `artifacts/athoo-app/.env` |

Copy the template:
```bash
cp .env.example artifacts/api-server/.env
```

---

## API Server Variables

### Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | Set to `production` in production |
| `PORT` | Yes | `5000` | Port the API server listens on |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PGSSLMODE` | Prod | — | Set to `require` for Neon/production |
| `JWT_SECRET` | Yes | — | 64+ random chars for JWT signing |
| `SESSION_SECRET` | Yes | — | 64+ random chars for session signing |
| `CORS_ORIGIN` | Prod | `*` | Comma-separated list of allowed origins |

**Generate secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Database

```
DATABASE_URL=postgresql://user:pass@host:5432/athoo?sslmode=require
PGSSLMODE=require
```

**Neon (recommended):** Use the **pooled** connection string for the app and the **direct** connection string for migrations.

### Security

```
JWT_SECRET=<64+ random hex chars>
SESSION_SECRET=<64+ random hex chars>
CORS_ORIGIN=https://admin.athoo.pk,https://app.athoo.pk
```

> In development, `CORS_ORIGIN` defaults to allowing all origins. In production, **always** set specific domains.

### Email (SMTP)

| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_FROM` | From address (e.g. `ATHOO <noreply@athoo.pk>`) |
| `EMAIL_FROM` | Same as `SMTP_FROM` (used in some templates) |

> Email is used for OTP delivery (email OTPs) and admin notifications. If not configured, email delivery will silently fail — OTP-based login still works via WhatsApp or SMS.

### WhatsApp OTP (Meta Business API)

| Variable | Description |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business API permanent token |
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp Business phone number ID |
| `WHATSAPP_TEMPLATE_NAME` | OTP message template name (default: `otp_verification`) |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Template language code (default: `en`) |

> If WhatsApp credentials are not set, OTPs will be logged to the server console in development mode only.

### File Storage

| Variable | Default | Description |
|---|---|---|
| `FILE_STORAGE_MODE` | `local` | `local` (disk) or `s3` (S3-compatible) |
| `S3_ENDPOINT` | — | S3 endpoint URL |
| `S3_BUCKET` | — | S3 bucket name |
| `S3_ACCESS_KEY` | — | S3 access key |
| `S3_SECRET_KEY` | — | S3 secret key |
| `S3_PUBLIC_URL` | — | Public base URL for uploaded files |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | — | Replit object storage bucket ID |
| `PRIVATE_OBJECT_DIR` | `uploads` | Directory prefix for private files |
| `PUBLIC_OBJECT_SEARCH_PATHS` | — | Comma-separated public paths |

> On Replit, object storage is configured automatically via the Replit secrets `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, and `PUBLIC_OBJECT_SEARCH_PATHS`.

### Admin Panel

| Variable | Description |
|---|---|
| `ADMIN_PANEL_URL` | URL of the admin panel (used in email links) |

### Platform Contact

| Variable | Default | Description |
|---|---|---|
| `SUPPORT_EMAIL` | `support@athoo.pk` | Support email shown in the app |
| `SUPPORT_PHONE` | `+92 339 0051068` | Support phone shown in the app |

---

## Mobile App Variables (Expo)

These are set in `artifacts/athoo-app/.env` and must be prefixed `EXPO_PUBLIC_` to be accessible at runtime.

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | Full URL of the API server (no trailing slash) |
| `EXPO_PUBLIC_DOMAIN` | Yes | API domain (without protocol) |
| `EXPO_PUBLIC_PROJECT_ID` | Yes | Expo project ID from expo.dev |
| `EXPO_PUBLIC_DISABLE_PUSH` | No | Set to `true` to disable push notifications (dev) |

**Development example:**
```
EXPO_PUBLIC_API_BASE_URL=https://your-replit-domain.replit.dev
EXPO_PUBLIC_DOMAIN=your-replit-domain.replit.dev
EXPO_PUBLIC_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EXPO_PUBLIC_DISABLE_PUSH=false
```

**Production example:**
```
EXPO_PUBLIC_API_BASE_URL=https://api.athoo.pk
EXPO_PUBLIC_DOMAIN=api.athoo.pk
EXPO_PUBLIC_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EXPO_PUBLIC_DISABLE_PUSH=false
```

> **Important:** `EXPO_PUBLIC_*` variables are baked into the JavaScript bundle at build time. Changing them requires a new EAS build and OTA update or full app store submission.

---

## Admin Panel Variables (Vite)

Admin panel is a static React app. API base URL is inferred at runtime from `window.location.origin`. No build-time env vars are required for standard deployments.

If you need to override:
| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Override API base URL (defaults to same origin) |

---

## Validation Checklist

Before deploying to production, verify:

```bash
# 1. Database connection
curl https://your-api.com/api/healthz/deep
# Expected: {"status":"ok","checks":{"database":{"ok":true}}}

# 2. CORS
curl -H "Origin: https://admin.athoo.pk" -I https://your-api.com/api/healthz
# Expected: Access-Control-Allow-Origin: https://admin.athoo.pk

# 3. Auth works
curl -X POST https://your-api.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"03000000001","password":"Admin@123","role":"admin"}'
# Expected: {"token":"...","user":{...}}
```

---

## Environment by Stage

| Variable | Development | Staging | Production |
|---|---|---|---|
| `NODE_ENV` | `development` | `staging` | `production` |
| `CORS_ORIGIN` | *(allow all)* | `https://staging.athoo.pk` | `https://admin.athoo.pk,https://app.athoo.pk` |
| `DATABASE_URL` | Local Postgres / Neon dev branch | Neon staging project | Neon production project |
| `PGSSLMODE` | *(optional)* | `require` | `require` |
| `FILE_STORAGE_MODE` | `local` | `s3` | `s3` |
| `EXPO_PUBLIC_API_BASE_URL` | Dev tunnel URL | Staging API URL | Production API URL |

---

## Secrets Security

- Never commit `.env` files to version control — `.gitignore` already excludes them
- Use your hosting platform's secrets manager (Render, Railway, Vercel, etc.)
- On Replit, use the built-in **Secrets** panel (Environment Variables section)
- Rotate `JWT_SECRET` and `SESSION_SECRET` periodically — this will invalidate all existing sessions
- The `SESSION_SECRET` and `DEFAULT_OBJECT_STORAGE_BUCKET_ID` are pre-configured as Replit secrets
