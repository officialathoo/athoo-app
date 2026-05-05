# ATHOO — Commercial Launch Checklist

Complete every item before going live with real users and real money.

---

## 🔐 Security

- [ ] **Change default admin password** — `admin@athoo.com` / `Admin@123` must be changed immediately
- [ ] **Change demo account passwords** — delete or secure demo@demo accounts
- [ ] **JWT_SECRET** is 64+ random characters (not the example value)
- [ ] **SESSION_SECRET** is 64+ random characters
- [ ] **CORS_ORIGIN** lists only your actual domains (no wildcards in production)
- [ ] **NODE_ENV=production** is set on the server
- [ ] **OTP codes** are not shown in production (`__DEV__` gate is active)
- [ ] **Database** uses SSL (`?sslmode=require` in DATABASE_URL)
- [ ] **HTTPS** enforced on all endpoints (Render/Vercel provide this automatically)
- [ ] **Admin panel** is not publicly indexed (add robots.txt or put behind VPN/IP restriction)

---

## 🗄️ Database

- [ ] Schema pushed: `pnpm db:push`
- [ ] Seed run: `pnpm db:seed`
- [ ] Health check passes: `GET /api/healthz/deep` returns `{"status":"ok"}`
- [ ] Backups enabled (Neon → Project Settings → Backups)
- [ ] Connection pooling enabled (use Neon pooled connection string)
- [ ] Indexes verified (all critical indexes are in the Drizzle schema)

---

## 📱 Mobile App

- [ ] `EXPO_PUBLIC_API_BASE_URL` points to production API (not localhost)
- [ ] `EXPO_PUBLIC_DISABLE_PUSH=false` in production
- [ ] Push notification credentials configured in Expo dashboard:
  - iOS: APNs key uploaded
  - Android: FCM server key uploaded
- [ ] `app.json` — `bundleIdentifier` (iOS) and `package` (Android) set to your own IDs
- [ ] `app.json` — `version` and `buildNumber` / `versionCode` set correctly
- [ ] `app.json` — Privacy policy URL set under `ios.privacyManifests` / store listing
- [ ] App icon and splash screen are your own (not placeholder)
- [ ] EAS build succeeds: `eas build --platform android --profile production`
- [ ] App tested on real Android device
- [ ] App tested on real iOS device (or TestFlight)
- [ ] Play Store listing complete (screenshots, description, privacy policy)
- [ ] App Store listing complete (screenshots, description, privacy policy)
- [ ] `targetSdkVersion: 34` set in `app.json` android block ✅

---

## 🖥️ Admin Panel

- [ ] Admin panel deployed and accessible
- [ ] Admin login works with new secure password
- [ ] Dashboard loads without errors
- [ ] All dashboard stat cards show real numbers and navigate correctly
- [ ] Provider verification workflow tested end-to-end
- [ ] Commission payment approval tested
- [ ] Support ticket reply tested
- [ ] Platform settings save and affect app behavior (test commissionRate, maintenanceMode)
- [ ] Admin panel not accessible with customer/provider JWT tokens

---

## 🌐 API Server

- [ ] Deployed on production server (Render, Railway, VPS, etc.)
- [ ] `GET /api/healthz` returns `{"status":"ok"}`
- [ ] `GET /api/healthz/deep` confirms database connectivity
- [ ] Login returns `token` in response body
- [ ] Provider cannot receive bookings when `verificationStatus != approved`
- [ ] Broadcast rejects missing lat/lng (test with empty coordinates)
- [ ] Maintenance mode works (enable in admin settings, verify API returns 503)
- [ ] Rate limiting active on auth endpoints

---

## 💬 Notifications

- [ ] Email SMTP configured and tested (send a test OTP)
- [ ] WhatsApp OTP configured (or email-only OTP accepted as fallback)
- [ ] In-app notifications appear for booking events
- [ ] Push notifications work on real devices (if EXPO_PUBLIC_DISABLE_PUSH=false)
- [ ] Support ticket reply triggers notification to user

---

## 💰 Payments & Commission

- [ ] Payment accounts added in admin panel (JazzCash / Easypaisa / bank)
- [ ] Commission rate set correctly in admin settings
- [ ] Commission limit set correctly
- [ ] Provider commission payment submission tested
- [ ] Admin commission approval/rejection tested
- [ ] Provider unblocks after commission payment approved

---

## 🏙️ Content

- [ ] Service categories created with correct icons and prices
- [ ] Service areas include all cities you operate in
- [ ] Emergency contacts populated
- [ ] Subscription plans created (if using premium model)
- [ ] Marketing banners created (optional)
- [ ] FAQ content added in admin (optional)

---

## 📋 Legal & Compliance

- [ ] Privacy policy published at a public URL
- [ ] Terms of service published at a public URL
- [ ] Privacy policy URL added to app store listings
- [ ] Data deletion request flow working (7-day grace period)
- [ ] CNIC / KYC documents stored securely (not publicly accessible URLs)

---

## 🚀 Go-Live

- [ ] All items above checked
- [ ] Load test performed (simulate 50+ concurrent users)
- [ ] Error monitoring set up (Sentry or similar)
- [ ] Uptime monitoring set up (UptimeRobot, Better Uptime, etc.)
- [ ] On-call contact defined for critical issues
- [ ] Admin password changed and stored in a password manager
- [ ] Team briefed on admin panel operations

---

## Post-Launch (Week 1)

- [ ] Monitor error logs daily
- [ ] Review all provider verification applications manually
- [ ] Monitor commission payments
- [ ] Check support ticket queue daily
- [ ] Verify first real booking completes end-to-end successfully
- [ ] Collect user feedback and log issues

---

> **Remember:** The default admin credentials (`admin@athoo.com` / `Admin@123`) must be changed before any real user can access the system. Failure to do so is a critical security risk.
