-- ============================================================
-- ATHOO — Database Seed Script (SQL version)
-- Generated: 2026-05-04
-- ============================================================
-- Run AFTER database.sql on a fresh database.
-- Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING.
-- ============================================================
-- Passwords are bcrypt-hashed (cost=10):
--   Admin@123  → $2a$10$w5NIccfKdZP.k5TFuZx.9.2PBEgfW52K0Ss1xkzrjXJjbSoOr8xGq
--   Demo@123   → $2a$10$f6PUmQhOZFIHNjqbh7X2QeSIZ7bAG2VJfJFtCkfP4mVbLKXFR0.5y
--   123456     → $2a$10$NDVNC9sNZVN7IJVbp2cAnOJi4cpYRJHQpGjpMJPZlDmOJlCJp5sLO
-- ============================================================
-- ⚠️ IMPORTANT: Change admin password immediately after seeding!
-- ============================================================

-- ─── Default Platform Settings ───────────────────────────────────────────────
INSERT INTO app_settings (key, value, updated_at) VALUES (
  'platform',
  '{
    "commissionRate": 10,
    "defaultCommissionLimit": 5000,
    "platformName": "Athoo",
    "supportPhone": "+92 339 0051068",
    "supportEmail": "support@athoo.pk",
    "maintenanceMode": false,
    "defaultVisitCharge": 200,
    "maxBookingsPerDay": 10,
    "appVersion": "1.0.0",
    "minBookingNoticeHours": 1,
    "allowGuestBrowsing": true,
    "providerAutoApprove": false,
    "bookingCancellationWindowHours": 1,
    "broadcastTTLMinutes": 30,
    "maxNegotiationRounds": 3,
    "premiumCommissionDiscountPercent": 0,
    "premiumPriorityBoost": true,
    "premiumProfileBadgeEnabled": true,
    "defaultServiceRadiusKm": 25,
    "customerCancellationFee": 0,
    "providerCancellationPenalty": 0
  }',
  NOW()
) ON CONFLICT (key) DO NOTHING;

-- ─── Super Admin ─────────────────────────────────────────────────────────────
INSERT INTO users (
  id, name, phone, email, role, admin_role, admin_permissions,
  password, verification_status, is_verified, is_available,
  is_blocked, is_deactivated, account_status, joined_at, updated_at
) VALUES (
  'admin-001',
  'ATHOO Admin',
  '03000000001',
  'admin@athoo.com',
  'admin',
  'super_admin',
  '["users","providers","bookings","support","payments","settings","categories","promotions","reports","audit"]',
  '$2a$10$w5NIccfKdZP.k5TFuZx.9.2PBEgfW52K0Ss1xkzrjXJjbSoOr8xGq',
  'approved', TRUE, FALSE, FALSE, FALSE, 'active',
  NOW(), NOW()
) ON CONFLICT (phone) DO NOTHING;

-- ─── Demo Customer ───────────────────────────────────────────────────────────
INSERT INTO users (
  id, name, phone, email, role, password,
  verification_status, is_verified, is_available, is_blocked, is_deactivated,
  account_status, location, latitude, longitude, joined_at, updated_at
) VALUES (
  'customer-001',
  'Ali Hassan (Demo Customer)',
  '03000000002',
  'customer@demo.athoo.com',
  'customer',
  '$2a$10$f6PUmQhOZFIHNjqbh7X2QeSIZ7bAG2VJfJFtCkfP4mVbLKXFR0.5y',
  'pending', FALSE, FALSE, FALSE, FALSE,
  'active', 'Lahore, Punjab', '31.5204', '74.3587',
  NOW(), NOW()
) ON CONFLICT (phone) DO NOTHING;

-- ─── Demo Pending Provider ───────────────────────────────────────────────────
INSERT INTO users (
  id, name, phone, email, role, password, verification_status,
  is_verified, is_available, is_blocked, is_deactivated, account_status,
  bio, experience, services, rate_per_hour, location, latitude, longitude,
  cnic_number, joined_at, updated_at
) VALUES (
  'provider-001',
  'Bilal Ahmed (Pending Provider)',
  '03000000003',
  'provider.pending@demo.athoo.com',
  'provider',
  '$2a$10$f6PUmQhOZFIHNjqbh7X2QeSIZ7bAG2VJfJFtCkfP4mVbLKXFR0.5y',
  'pending', FALSE, FALSE, FALSE, FALSE, 'active',
  'Experienced electrician with 5+ years of residential work.',
  '5 years', ARRAY['Electrician', 'Wiring'], 800,
  'Karachi, Sindh', '24.8607', '67.0011',
  '42101-1234567-1',
  NOW(), NOW()
) ON CONFLICT (phone) DO NOTHING;

-- ─── Demo Approved Provider ───────────────────────────────────────────────────
INSERT INTO users (
  id, name, phone, email, role, password, verification_status,
  is_verified, is_available, is_blocked, is_deactivated, account_status,
  bio, experience, services, rate_per_hour, rating, rating_count, total_jobs,
  location, latitude, longitude, cnic_number, joined_at, updated_at
) VALUES (
  'provider-002',
  'Usman Malik (Approved Provider)',
  '03000000004',
  'provider.approved@demo.athoo.com',
  'provider',
  '$2a$10$f6PUmQhOZFIHNjqbh7X2QeSIZ7bAG2VJfJFtCkfP4mVbLKXFR0.5y',
  'approved', TRUE, TRUE, FALSE, FALSE, 'active',
  'Professional plumber & sanitation expert. 8 years experience.',
  '8 years', ARRAY['Plumber', 'Sanitation', 'Drainage'], 1000,
  45, 10, 37,
  'Islamabad, ICT', '33.6844', '73.0479',
  '37405-9876543-2',
  NOW(), NOW()
) ON CONFLICT (phone) DO NOTHING;

-- ─── Demo Customer #2 ────────────────────────────────────────────────────────
INSERT INTO users (
  id, name, phone, email, role, password,
  verification_status, is_verified, is_available, is_blocked, is_deactivated,
  account_status, location, latitude, longitude, joined_at, updated_at
) VALUES (
  'customer-002',
  'Sara Khan (Demo Customer)',
  '03485739871',
  'sara.demo@athoo.com',
  'customer',
  '$2a$10$NDVNC9sNZVN7IJVbp2cAnOJi4cpYRJHQpGjpMJPZlDmOJlCJp5sLO',
  'pending', FALSE, FALSE, FALSE, FALSE,
  'active', 'Lahore, Punjab', '31.5204', '74.3587',
  NOW(), NOW()
) ON CONFLICT (phone) DO NOTHING;

-- ─── Demo Approved Provider #2 ───────────────────────────────────────────────
INSERT INTO users (
  id, name, phone, email, role, password, verification_status,
  is_verified, is_available, is_blocked, is_deactivated, account_status,
  bio, experience, services, rate_per_hour, rating, rating_count, total_jobs,
  location, latitude, longitude, cnic_number, joined_at, updated_at
) VALUES (
  'provider-003',
  'Hamza Raza (Demo Provider)',
  '03429699652',
  'hamza.demo@athoo.com',
  'provider',
  '$2a$10$NDVNC9sNZVN7IJVbp2cAnOJi4cpYRJHQpGjpMJPZlDmOJlCJp5sLO',
  'approved', TRUE, TRUE, FALSE, FALSE, 'active',
  'Certified electrician with 6 years of residential and commercial experience.',
  '6 years', ARRAY['Electrician', 'Wiring', 'Appliance Repair'], 900,
  42, 8, 24,
  'Lahore, Punjab', '31.5204', '74.3587',
  '35202-8765432-3',
  NOW(), NOW()
) ON CONFLICT (phone) DO NOTHING;

-- ─── Demo Pending Provider #3 ────────────────────────────────────────────────
INSERT INTO users (
  id, name, phone, email, role, password, verification_status,
  is_verified, is_available, is_blocked, is_deactivated, account_status,
  bio, experience, services, rate_per_hour, location, latitude, longitude,
  joined_at, updated_at
) VALUES (
  'provider-004',
  'Zain Ul Abideen (Pending)',
  '03000000000',
  'zain.demo@athoo.com',
  'provider',
  '$2a$10$NDVNC9sNZVN7IJVbp2cAnOJi4cpYRJHQpGjpMJPZlDmOJlCJp5sLO',
  'pending', FALSE, FALSE, FALSE, FALSE, 'active',
  'Plumber looking to grow on Athoo platform.',
  '3 years', ARRAY['Plumber', 'Drainage'], 700,
  'Islamabad, ICT', '33.6844', '73.0479',
  NOW(), NOW()
) ON CONFLICT (phone) DO NOTHING;

-- ─── Service Categories ───────────────────────────────────────────────────────
INSERT INTO service_categories (id, slug, name, icon, color, visit_charge, commission_pct, min_hourly_rate, max_hourly_rate, is_active, sort_order, created_at, updated_at) VALUES
  ('cat-001', 'electrician',  'Electrician',     'zap',          '#F59E0B', 200, 10,  500,  2000, TRUE,  1, NOW(), NOW()),
  ('cat-002', 'plumber',      'Plumber',          'droplets',     '#3B82F6', 200, 10,  500,  2000, TRUE,  2, NOW(), NOW()),
  ('cat-003', 'carpenter',    'Carpenter',        'hammer',       '#92400E', 200, 10,  600,  2500, TRUE,  3, NOW(), NOW()),
  ('cat-004', 'painter',      'Painter',          'paint-bucket', '#EF4444', 150, 10,  400,  1500, TRUE,  4, NOW(), NOW()),
  ('cat-005', 'ac-repair',    'AC Repair',        'wind',         '#06B6D4', 300, 12,  800,  3000, TRUE,  5, NOW(), NOW()),
  ('cat-006', 'cleaning',     'Cleaning',         'sparkles',     '#10B981', 150, 10,  300,  1200, TRUE,  6, NOW(), NOW()),
  ('cat-007', 'pest-control', 'Pest Control',     'bug',          '#84CC16', 200, 12,  600,  2000, TRUE,  7, NOW(), NOW()),
  ('cat-008', 'gas-repair',   'Gas Repair',       'flame',        '#F97316', 200, 10,  500,  2000, TRUE,  8, NOW(), NOW()),
  ('cat-009', 'cctv',         'CCTV & Security',  'camera',       '#6366F1', 300, 12,  800,  3000, TRUE,  9, NOW(), NOW()),
  ('cat-010', 'appliance',    'Appliance Repair',  'tv',           '#8B5CF6', 200, 10,  500,  2000, TRUE, 10, NOW(), NOW()),
  ('cat-011', 'shifting',     'House Shifting',   'truck',        '#64748B', 500, 10, 1000,  5000, TRUE, 11, NOW(), NOW()),
  ('cat-012', 'gardening',    'Gardening',        'leaf',         '#22C55E', 150, 10,  400,  1500, TRUE, 12, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- ─── Service Areas ────────────────────────────────────────────────────────────
INSERT INTO service_areas (id, name, province, is_active, sort_order, created_at, updated_at) VALUES
  ('area-001', 'Lahore',      'Punjab',      TRUE,  1, NOW(), NOW()),
  ('area-002', 'Karachi',     'Sindh',       TRUE,  2, NOW(), NOW()),
  ('area-003', 'Islamabad',   'ICT',         TRUE,  3, NOW(), NOW()),
  ('area-004', 'Rawalpindi',  'Punjab',      TRUE,  4, NOW(), NOW()),
  ('area-005', 'Faisalabad',  'Punjab',      TRUE,  5, NOW(), NOW()),
  ('area-006', 'Multan',      'Punjab',      TRUE,  6, NOW(), NOW()),
  ('area-007', 'Peshawar',    'KPK',         TRUE,  7, NOW(), NOW()),
  ('area-008', 'Quetta',      'Balochistan', TRUE,  8, NOW(), NOW()),
  ('area-009', 'Gujranwala',  'Punjab',      TRUE,  9, NOW(), NOW()),
  ('area-010', 'Sialkot',     'Punjab',      TRUE, 10, NOW(), NOW()),
  ('area-011', 'Hyderabad',   'Sindh',       TRUE, 11, NOW(), NOW()),
  ('area-012', 'Bahawalpur',  'Punjab',      TRUE, 12, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ─── Default Payment Account ──────────────────────────────────────────────────
INSERT INTO payment_accounts (id, label, bank_name, account_title, account_number, iban, instructions, is_active, sort_order, created_at, updated_at) VALUES (
  'acct-001',
  'JazzCash Business',
  'JazzCash',
  'ATHOO Technologies',
  '03339001234',
  NULL,
  'Send payment to JazzCash 03339001234 (ATHOO Technologies). Include your name and booking ID in the description.',
  TRUE, 1, NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ─── Subscription Plans ───────────────────────────────────────────────────────
INSERT INTO subscription_plans (id, name, description, audience, price_monthly, price_yearly, features, is_active, sort_order, created_at, updated_at) VALUES
(
  'plan-provider-basic',
  'Provider Basic',
  'Essential features for getting started on Athoo',
  'provider', 0, 0,
  '["List your services","Accept bookings","Customer chat","Basic profile"]',
  TRUE, 1, NOW(), NOW()
),
(
  'plan-provider-pro',
  'Provider Pro',
  'Grow faster with priority placement and reduced commission',
  'provider', 999, 9999,
  '["Everything in Basic","Priority in search results","Reduced commission rate","Pro badge on profile","Broadcast job alerts","Advanced analytics"]',
  TRUE, 2, NOW(), NOW()
),
(
  'plan-customer-premium',
  'Customer Premium',
  'Priority service and exclusive discounts',
  'customer', 299, 2999,
  '["Priority provider matching","Exclusive promo codes","Free cancellation","Dedicated support","Service history export"]',
  TRUE, 3, NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- ─── Emergency Contacts ───────────────────────────────────────────────────────
INSERT INTO emergency_contacts (id, name, number, description, icon, sort_order, is_active, created_at, updated_at) VALUES
  ('ec-001', 'Rescue 1122',       '1122', 'Emergency rescue and medical services (Punjab)', 'phone-call', 1, TRUE, NOW(), NOW()),
  ('ec-002', 'Police',            '15',   'Pakistan Police emergency helpline',              'shield',     2, TRUE, NOW(), NOW()),
  ('ec-003', 'Fire Brigade',      '16',   'Fire emergency services',                         'flame',      3, TRUE, NOW(), NOW()),
  ('ec-004', 'Edhi Foundation',   '115',  '24/7 ambulance and humanitarian services',        'heart',      4, TRUE, NOW(), NOW()),
  ('ec-005', 'Chhipa Welfare',    '1020', 'Emergency ambulance service',                     'activity',   5, TRUE, NOW(), NOW()),
  ('ec-006', 'ATHOO Support',     '+92 339 0051068', 'ATHOO customer support helpline',      'headphones', 6, TRUE, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ─── Notification Templates ───────────────────────────────────────────────────
INSERT INTO notification_templates (id, key, name, channel, target_audience, subject, body, is_active, created_at, updated_at) VALUES
  ('nt-001', 'booking_confirmed',      'Booking Confirmed',           'push', 'customer', NULL, 'Your booking #{{booking_id}} with {{provider_name}} is confirmed for {{date}} at {{time}}.', TRUE, NOW(), NOW()),
  ('nt-002', 'booking_accepted',       'Booking Accepted',            'push', 'customer', NULL, '{{provider_name}} has accepted your booking and is on the way!', TRUE, NOW(), NOW()),
  ('nt-003', 'booking_completed',      'Job Completed',               'push', 'customer', NULL, 'Your job #{{booking_id}} has been completed. Please rate your experience!', TRUE, NOW(), NOW()),
  ('nt-004', 'new_booking_request',    'New Booking Request',         'push', 'provider', NULL, 'New job request: {{service}} at {{address}} on {{date}}.', TRUE, NOW(), NOW()),
  ('nt-005', 'payment_received',       'Payment Received',            'push', 'provider', NULL, 'Payment of PKR {{amount}} received for job #{{booking_id}}.', TRUE, NOW(), NOW()),
  ('nt-006', 'commission_approved',    'Commission Payment Approved', 'push', 'provider', NULL, 'Your commission payment of PKR {{amount}} has been approved. Keep it up!', TRUE, NOW(), NOW()),
  ('nt-007', 'commission_rejected',    'Commission Payment Rejected', 'push', 'provider', NULL, 'Your commission payment of PKR {{amount}} was rejected. Reason: {{reason}}', TRUE, NOW(), NOW()),
  ('nt-008', 'verification_approved',  'Account Verified',            'push', 'provider', NULL, 'Congratulations! Your account has been verified. You can now accept bookings.', TRUE, NOW(), NOW()),
  ('nt-009', 'broadcast_new_job',      'New Broadcast Job',           'push', 'provider', NULL, '{{customer_name}} needs {{service}} near {{address}}. Tap to respond!', TRUE, NOW(), NOW()),
  ('nt-010', 'booking_cancelled',      'Booking Cancelled',           'push', 'all',      NULL, 'Booking #{{booking_id}} has been cancelled.', TRUE, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- ─── FAQ Entries ──────────────────────────────────────────────────────────────
INSERT INTO faqs (id, question, answer, category, target_audience, sort_order, is_active, created_at, updated_at) VALUES
  ('faq-001', 'How do I book a service?',         'Go to the Home screen, choose a service category, select a nearby provider, and tap "Book Now". Set your date, time, and address to confirm.', 'booking',  'customer', 1, TRUE, NOW(), NOW()),
  ('faq-002', 'How is the price calculated?',     'Providers set an hourly rate. A visit charge may apply. The final price is agreed between you and the provider before the job starts.', 'payment',  'customer', 2, TRUE, NOW(), NOW()),
  ('faq-003', 'How do I pay?',                    'ATHOO uses cash payment. After the job is complete, you confirm cash paid and the provider confirms cash received in the app.', 'payment',  'customer', 3, TRUE, NOW(), NOW()),
  ('faq-004', 'Can I cancel a booking?',          'Yes, you can cancel a booking before the provider arrives. Go to My Bookings, select the booking, and tap Cancel.', 'booking',  'customer', 4, TRUE, NOW(), NOW()),
  ('faq-005', 'How do I become a provider?',      'Register as a provider, fill in your profile and service details, upload your CNIC/verification documents, and submit for review. Our team verifies accounts within 24-48 hours.', 'general',  'provider', 1, TRUE, NOW(), NOW()),
  ('faq-006', 'What is commission?',              'ATHOO charges a commission (default 10%) on each completed job. You can pay your pending commission from the Wallet screen.', 'payment',  'provider', 2, TRUE, NOW(), NOW()),
  ('faq-007', 'How do I receive payments?',       'Customers pay you in cash after each job. You confirm receipt in the app. You can also withdraw your earnings via the Wallet screen.', 'payment',  'provider', 3, TRUE, NOW(), NOW()),
  ('faq-008', 'Is ATHOO available in my city?',   'ATHOO currently operates in Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar, Quetta, Gujranwala, Sialkot, Hyderabad, and Bahawalpur.', 'general',  'all',      1, TRUE, NOW(), NOW()),
  ('faq-009', 'How do I contact support?',        'Go to the Help & Support screen in your profile. You can raise a support ticket, call our helpline, or chat with our AI assistant.', 'general',  'all',      2, TRUE, NOW(), NOW()),
  ('faq-010', 'How are providers verified?',      'Providers must submit their CNIC (National ID), a selfie, and relevant certifications. Our team reviews each application within 24-48 hours.', 'general',  'customer', 5, TRUE, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED COMPLETE
-- ============================================================
-- Default credentials:
--   Super Admin:  03000000001  /  Admin@123
--   Customer:     03000000002  /  Demo@123
--   Provider:     03000000004  /  Demo@123 (approved)
--
-- ⚠️  Change admin credentials immediately in production!
-- ============================================================
