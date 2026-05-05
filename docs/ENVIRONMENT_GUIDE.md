# ATHOO Environment Variables Guide

All environment variables required to run ATHOO in production.

---

## API Server (`artifacts/api-server`)

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `JWT_SECRET` | 64-char random secret for JWT signing | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `SESSION_SECRET` | 64-char random secret for sessions | same generation command |

### Recommended

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Server port | `5000` (Render uses `10000`) |
| `PGSSLMODE` | Force SSL on DB connection | `require` |
| `LOG_LEVEL` | Pino log level | `info` |
| `CORS_ORIGIN` | Comma-separated allowed origins | `https://admin.athoo.pk` |

### File Storage (Replit Object Storage)

| Variable | Description |
|----------|-------------|
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Replit bucket ID |
| `PRIVATE_OBJECT_DIR` | Path prefix for private files (provider docs) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Comma-separated paths for public files |

> These are automatically set in the Replit environment. For Render deployment, copy them from Replit's Secrets panel into Render's environment variables.

### Optional

| Variable | Description |
|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business API token for OTP via WhatsApp |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID |
| `WHATSAPP_TEMPLATE_NAME` | OTP template name (default: `otp_verification`) |
| `SMTP_HOST` | Email SMTP host |
| `SMTP_PORT` | Email SMTP port |
| `SMTP_USER` | Email SMTP username |
| `SMTP_PASS` | Email SMTP password |

---

## Admin Panel (`artifacts/admin-panel`)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Full URL to the API server | `https://athoo-api.onrender.com` |

> In development, the Vite dev server proxies `/api` automatically — `VITE_API_URL` is only needed for production builds.

---

## Mobile App (`artifacts/athoo-app`)

The mobile app's API URL is configured in `artifacts/athoo-app/services/api.ts`.

For production, update `BASE_URL` in that file to your Render API URL before building with Expo EAS.

| Variable (in code) | Description |
|--------------------|-------------|
| `BASE_URL` | Points to `/api` path on deployed API server |

---

## Development `.env` Template

```env
# Server
NODE_ENV=development
PORT=5000

# Database
DATABASE_URL=postgresql://localhost:5432/athoo
PGSSLMODE=disable

# Security (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=change_me_min_64_chars
SESSION_SECRET=change_me_min_64_chars

# CORS (leave blank to allow all in development)
CORS_ORIGIN=

# Logging
LOG_LEVEL=debug

# File Storage (copy from Replit Secrets)
DEFAULT_OBJECT_STORAGE_BUCKET_ID=
PRIVATE_OBJECT_DIR=
PUBLIC_OBJECT_SEARCH_PATHS=

# WhatsApp OTP (optional in dev — OTP is logged to console if not set)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

---

## Security Notes

- **Never commit `.env` to version control.** The `.gitignore` already excludes it.
- Use at least 64 random bytes for `JWT_SECRET` and `SESSION_SECRET`.
- Rotate secrets immediately if you suspect exposure — all existing JWT tokens will be invalidated.
- `DATABASE_URL` must include `?sslmode=require` for Neon connections.
- `CORS_ORIGIN` should be set to only your admin panel domain in production; `*` is never safe in production.
