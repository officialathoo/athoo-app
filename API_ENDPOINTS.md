# ATHOO — API Endpoints Reference

Base URL: `https://your-api-domain.com/api`

All authenticated endpoints require:
```
Authorization: Bearer <jwt_token>
```

All responses follow the format:
```json
{ "success": true, "data": {}, "token": "", "user": {}, "message": "", "error": "" }
```

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/healthz` | None | Quick health check |
| GET | `/healthz/deep` | None | DB ping health check |

---

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/send-otp` | None | Send OTP to phone (+ optional email) |
| POST | `/auth/verify-otp` | None | Verify OTP — register or login |
| POST | `/auth/register` | None | Register with phone + password |
| POST | `/auth/login` | None | Login with email/phone + password |
| POST | `/auth/forgot-password` | None | Request password reset OTP |
| POST | `/auth/reset-password` | None | Reset password with OTP |
| POST | `/auth/set-password` | ✓ | Change password (requires current) |
| POST | `/auth/switch-role` | ✓ | Switch between customer/provider roles |
| POST | `/auth/refresh` | ✓ | Refresh JWT token |

---

## Account (`/me/account`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me/account/profile` | ✓ | Get own profile |
| PATCH | `/me/account/profile` | ✓ | Update own profile |
| POST | `/me/account/delete-request` | ✓ | Request account deletion (7-day grace) |
| POST | `/me/account/delete-request/cancel` | deactivated-ok | Cancel pending deletion |
| POST | `/me/account/reactivate` | deactivated-ok | Reactivate deactivated account |
| POST | `/me/account/request-email-change` | ✓ | Request email change (OTP) |
| POST | `/me/account/confirm-email-change` | ✓ | Confirm email change with OTP |
| POST | `/me/account/request-phone-change` | ✓ | Request phone change (OTP) |
| POST | `/me/account/confirm-phone-change` | ✓ | Confirm phone change with OTP |
| GET | `/me/account/login-history` | ✓ | Last 20 login attempts |
| POST | `/me/account/request-service` | provider | Request adding a new service |
| GET | `/me/account/service-requests` | provider | Own service add requests |

---

## Me (Current User)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | ✓ | Profile shortcut |
| GET | `/me/bookings` | ✓ | Own booking history |
| GET | `/me/notifications` | ✓ | Notification list |
| PATCH | `/me/notifications/:id/read` | ✓ | Mark notification read |
| POST | `/me/notifications/read-all` | ✓ | Mark all read |
| GET | `/me/saved-providers` | customer | Saved provider list |
| POST | `/me/saved-providers/:id` | customer | Save a provider |
| DELETE | `/me/saved-providers/:id` | customer | Unsave a provider |
| GET | `/me/addresses` | ✓ | Address book |
| POST | `/me/addresses` | ✓ | Add address |
| PATCH | `/me/addresses/:id` | ✓ | Update address |
| DELETE | `/me/addresses/:id` | ✓ | Delete address |

---

## Broadcast (Service Requests)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/broadcast` | customer | Create broadcast request (requires lat/lng) |
| GET | `/broadcast` | provider | List open broadcasts near provider |
| GET | `/broadcast/:id` | ✓ | Get broadcast detail |
| POST | `/broadcast/:id/respond` | provider | Accept / counter / reject a broadcast |
| GET | `/broadcast/:id/responses` | customer | View responses to own broadcast |
| POST | `/broadcast/:id/accept-response` | customer | Accept a provider response |
| POST | `/broadcast/:id/cancel` | customer | Cancel broadcast |
| GET | `/broadcast/my` | customer | Own broadcast history |

---

## Bookings

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/bookings` | customer | Create direct booking |
| GET | `/bookings` | ✓ | List bookings (role-filtered) |
| GET | `/bookings/:id` | ✓ | Booking detail |
| POST | `/bookings/:id/accept` | provider | Accept booking |
| POST | `/bookings/:id/arrive` | provider | Mark arrived at customer |
| POST | `/bookings/:id/start` | ✓ | Start job (with OTP/PIN) |
| POST | `/bookings/:id/complete` | ✓ | Complete job (with OTP/PIN) |
| POST | `/bookings/:id/cancel` | ✓ | Cancel booking |
| POST | `/bookings/:id/generate-start-pin` | ✓ | Generate start OTP |
| POST | `/bookings/:id/generate-end-pin` | ✓ | Generate end OTP |
| POST | `/bookings/:id/rate` | customer | Rate and review completed booking |
| PATCH | `/bookings/:id/location` | provider | Update provider GPS location |

---

## Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/chat` | ✓ | List conversations |
| GET | `/chat/:bookingId` | ✓ | Get chat for booking |
| POST | `/chat/:bookingId` | ✓ | Send message |
| PATCH | `/chat/:bookingId/read` | ✓ | Mark messages read |

---

## Support Tickets

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/support` | ✓ | Create support ticket |
| GET | `/support/my` | ✓ | Own ticket list |
| GET | `/support/:id` | ✓ | Ticket detail + replies |
| POST | `/support/:id/reply` | ✓ | Reply to open ticket |

---

## Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/payments/accounts` | ✓ | List payment accounts (for commission) |
| POST | `/payments/commission` | provider | Submit commission payment proof |
| GET | `/payments/my-commission` | provider | Own commission payment history |
| GET | `/payments/withdrawals` | provider | Own withdrawal requests |
| POST | `/withdrawals` | provider | Request a withdrawal |

---

## Providers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/providers` | ✓ | Browse providers (with filters) |
| GET | `/providers/:id` | ✓ | Provider public profile |
| GET | `/providers/:id/reviews` | ✓ | Provider reviews |
| GET | `/ratings` | ✓ | Ratings list |

---

## Negotiations

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/negotiations` | ✓ | Create price negotiation |
| GET | `/negotiations/:bookingId` | ✓ | Negotiation thread for booking |
| POST | `/negotiations/:id/respond` | ✓ | Accept / counter / reject offer |

---

## Categories

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/categories` | None | Active service categories |
| GET | `/categories/:slug` | None | Category detail |

---

## Service Areas

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/service-areas` | None | Active city/service areas |

---

## Promotions & Marketing

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/promotions` | None | Active promotions |
| GET | `/marketing/banners` | None | Active marketing banners |

---

## Subscriptions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/subscriptions/plans` | None | Active subscription plans |
| POST | `/subscriptions` | ✓ | Subscribe to a plan |
| GET | `/subscriptions/my` | ✓ | Own subscription status |

---

## Emergency Contacts

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/emergency-contacts` | ✓ | Platform emergency contact numbers |

---

## Chatbot

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/chatbot` | ✓ | AI chatbot message |

---

## Admin Endpoints (`/admin/*`)

All admin endpoints require `role=admin`. Super admin has all permissions; others need specific permissions.

### Users
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/users` | users | List all users |
| GET | `/admin/users/:id` | users | User detail |
| PATCH | `/admin/users/:id` | users | Update user |
| POST | `/admin/users/:id/block` | users | Block user |
| POST | `/admin/users/:id/unblock` | users | Unblock user |
| POST | `/admin/users/:id/approve` | providers | Approve provider |
| POST | `/admin/users/:id/reject` | providers | Reject provider |

### Bookings
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/bookings` | bookings | All bookings with filters |
| GET | `/admin/bookings/:id` | bookings | Booking detail |
| PATCH | `/admin/bookings/:id` | bookings | Update booking |

### Support
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/support` | support | All tickets |
| GET | `/admin/support/:id` | support | Ticket detail |
| POST | `/admin/support/:id/reply` | support | Admin reply |
| PATCH | `/admin/support/:id` | support | Update ticket status/priority |

### Payments
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/payments/commission` | payments | Commission payment submissions |
| POST | `/admin/payments/commission/:id/approve` | payments | Approve payment |
| POST | `/admin/payments/commission/:id/reject` | payments | Reject payment |
| GET | `/admin/withdrawals` | payments | Withdrawal requests |
| POST | `/admin/withdrawals/:id/approve` | payments | Approve withdrawal |

### Settings & Content
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/settings` | settings | Platform settings |
| PATCH | `/admin/settings` | settings | Update platform settings |
| GET | `/admin/categories` | settings | All categories |
| POST | `/admin/categories` | settings | Create category |
| PATCH | `/admin/categories/:id` | settings | Update category |
| DELETE | `/admin/categories/:id` | settings | Delete category |
| GET | `/admin/service-areas` | settings | All service areas |
| POST | `/admin/service-areas` | settings | Create service area |
| PATCH | `/admin/service-areas/:id` | settings | Update service area |

### Dashboard & Reports
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/dashboard` | — | Dashboard stats |
| GET | `/admin/reports` | reports | Revenue / booking reports |
| GET | `/admin/audit-log` | audit | Admin audit log |

### Notifications & Broadcasts
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/admin/broadcast` | — | Send push notification to users |
| GET | `/admin/notifications` | — | Admin notification inbox |
| PATCH | `/admin/notifications/:id/read` | — | Mark admin notification read |

### Verifications
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/admin/verifications` | providers | Pending verifications |
| GET | `/admin/verifications/:id` | providers | Provider docs |
| POST | `/admin/verifications/:id/approve` | providers | Approve provider |
| POST | `/admin/verifications/:id/reject` | providers | Reject with note |
| POST | `/admin/verifications/:id/request-correction` | providers | Request document corrections |

---

## Error Codes

| HTTP | Meaning |
|---|---|
| 400 | Bad request — check the error message for which field is missing/invalid |
| 401 | Not authenticated — missing or expired token |
| 403 | Forbidden — wrong role or permission |
| 404 | Resource not found |
| 429 | Rate limited — too many requests |
| 503 | Maintenance mode active |
| 500 | Internal server error |

---

## Rate Limits

Auth endpoints are rate-limited to **10 requests per 15 minutes** per identifier (phone/email or IP if no identifier).

All other endpoints share a global limit of **200 requests per 15 minutes** per IP.
