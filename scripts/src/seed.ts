/**
 * ATHOO Database Seed Script
 *
 * Creates:
 *  - Super admin  (admin@athoo.com / phone: 03000000001 / Admin@123)
 *  - Demo customer
 *  - Demo pending provider
 *  - Demo approved provider
 *  - 12 Pakistani home-service categories
 *  - Service areas (major Pakistani cities)
 *  - Default platform settings
 *
 * Run:  pnpm db:seed
 * Safe to re-run — skips already-existing records.
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  serviceCategoriesTable,
  serviceAreasTable,
  appSettingsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const uid = () => crypto.randomUUID();
const hashPw = (pw: string) => bcrypt.hash(pw, 10);
const userExists = async (phone: string) =>
  Boolean(await db.query.usersTable.findFirst({ where: eq(usersTable.phone, phone) }));

// ─── Users ───────────────────────────────────────────────────────────────────

async function seedAdmin() {
  const phone = "03000000001";
  if (await userExists(phone)) { console.log("  ↳ Super admin already exists"); return; }
  await db.insert(usersTable).values({
    id: uid(),
    name: "ATHOO Admin",
    phone,
    email: "admin@athoo.com",
    role: "admin",
    adminRole: "super_admin",
    adminPermissions: [
      "users", "providers", "bookings", "support", "payments",
      "settings", "categories", "promotions", "reports", "audit",
    ],
    password: await hashPw("Admin@123"),
    verificationStatus: "approved",
    isVerified: true,
    isAvailable: false,
    isBlocked: false,
    isDeactivated: false,
    accountStatus: "active",
    joinedAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("  ✔ Super admin          phone=03000000001  password=Admin@123");
}

async function seedCustomer() {
  const phone = "03000000002";
  if (await userExists(phone)) { console.log("  ↳ Demo customer already exists"); return; }
  await db.insert(usersTable).values({
    id: uid(),
    name: "Ali Hassan (Demo Customer)",
    phone,
    email: "customer@demo.athoo.com",
    role: "customer",
    password: await hashPw("Demo@123"),
    verificationStatus: "pending",
    isVerified: false,
    isAvailable: false,
    isBlocked: false,
    isDeactivated: false,
    accountStatus: "active",
    location: "Lahore, Punjab",
    latitude: "31.5204",
    longitude: "74.3587",
    joinedAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("  ✔ Demo customer        phone=03000000002  password=Demo@123");
}

async function seedPendingProvider() {
  const phone = "03000000003";
  if (await userExists(phone)) { console.log("  ↳ Demo pending provider already exists"); return; }
  await db.insert(usersTable).values({
    id: uid(),
    name: "Bilal Ahmed (Pending Provider)",
    phone,
    email: "provider.pending@demo.athoo.com",
    role: "provider",
    password: await hashPw("Demo@123"),
    verificationStatus: "pending",
    isVerified: false,
    isAvailable: false,
    isBlocked: false,
    isDeactivated: false,
    accountStatus: "active",
    bio: "Experienced electrician with 5+ years of residential work.",
    experience: "5 years",
    services: ["Electrician", "Wiring"],
    ratePerHour: 800,
    location: "Karachi, Sindh",
    latitude: "24.8607",
    longitude: "67.0011",
    cnicNumber: "42101-1234567-1",
    joinedAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("  ✔ Pending provider     phone=03000000003  password=Demo@123");
}

async function seedApprovedProvider() {
  const phone = "03000000004";
  if (await userExists(phone)) { console.log("  ↳ Demo approved provider already exists"); return; }
  await db.insert(usersTable).values({
    id: uid(),
    name: "Usman Malik (Approved Provider)",
    phone,
    email: "provider.approved@demo.athoo.com",
    role: "provider",
    password: await hashPw("Demo@123"),
    verificationStatus: "approved",
    isVerified: true,
    isAvailable: true,
    isBlocked: false,
    isDeactivated: false,
    accountStatus: "active",
    bio: "Professional plumber & sanitation expert. 8 years experience.",
    experience: "8 years",
    services: ["Plumber", "Sanitation", "Drainage"],
    ratePerHour: 1000,
    rating: 45,
    ratingCount: 10,
    totalJobs: 37,
    location: "Islamabad, ICT",
    latitude: "33.6844",
    longitude: "73.0479",
    cnicNumber: "37405-9876543-2",
    joinedAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("  ✔ Approved provider    phone=03000000004  password=Demo@123");
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { slug: "electrician",  name: "Electrician",     icon: "zap",          color: "#F59E0B", visitCharge: 200, commissionPct: 10, min: 500,  max: 2000 },
  { slug: "plumber",      name: "Plumber",          icon: "droplets",     color: "#3B82F6", visitCharge: 200, commissionPct: 10, min: 500,  max: 2000 },
  { slug: "carpenter",    name: "Carpenter",        icon: "hammer",       color: "#92400E", visitCharge: 200, commissionPct: 10, min: 600,  max: 2500 },
  { slug: "painter",      name: "Painter",          icon: "paint-bucket", color: "#EF4444", visitCharge: 150, commissionPct: 10, min: 400,  max: 1500 },
  { slug: "ac-repair",    name: "AC Repair",        icon: "wind",         color: "#06B6D4", visitCharge: 300, commissionPct: 12, min: 800,  max: 3000 },
  { slug: "cleaning",     name: "Cleaning",         icon: "sparkles",     color: "#10B981", visitCharge: 150, commissionPct: 10, min: 300,  max: 1200 },
  { slug: "pest-control", name: "Pest Control",     icon: "bug",          color: "#84CC16", visitCharge: 200, commissionPct: 12, min: 600,  max: 2000 },
  { slug: "gas-repair",   name: "Gas Repair",       icon: "flame",        color: "#F97316", visitCharge: 200, commissionPct: 10, min: 500,  max: 2000 },
  { slug: "cctv",         name: "CCTV & Security",  icon: "camera",       color: "#6366F1", visitCharge: 300, commissionPct: 12, min: 800,  max: 3000 },
  { slug: "appliance",    name: "Appliance Repair", icon: "tv",           color: "#8B5CF6", visitCharge: 200, commissionPct: 10, min: 500,  max: 2000 },
  { slug: "shifting",     name: "House Shifting",   icon: "truck",        color: "#64748B", visitCharge: 500, commissionPct: 10, min: 1000, max: 5000 },
  { slug: "gardening",    name: "Gardening",        icon: "leaf",         color: "#22C55E", visitCharge: 150, commissionPct: 10, min: 400,  max: 1500 },
] as const;

async function seedCategories() {
  const existing = await db.select({ slug: serviceCategoriesTable.slug }).from(serviceCategoriesTable);
  const existingSlugs = new Set(existing.map((r) => r.slug));
  let added = 0;
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    if (existingSlugs.has(c.slug)) continue;
    await db.insert(serviceCategoriesTable).values({
      id: uid(),
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      color: c.color,
      visitCharge: c.visitCharge,
      commissionPct: c.commissionPct,
      minHourlyRate: c.min,
      maxHourlyRate: c.max,
      isActive: true,
      sortOrder: i + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    added++;
  }
  console.log(`  ✔ Categories: ${added} added, ${existingSlugs.size} already existed`);
}

// ─── Service Areas ────────────────────────────────────────────────────────────

const CITIES = [
  { name: "Lahore",     province: "Punjab" },
  { name: "Karachi",    province: "Sindh" },
  { name: "Islamabad",  province: "ICT" },
  { name: "Rawalpindi", province: "Punjab" },
  { name: "Faisalabad", province: "Punjab" },
  { name: "Multan",     province: "Punjab" },
  { name: "Peshawar",   province: "KPK" },
  { name: "Quetta",     province: "Balochistan" },
  { name: "Gujranwala", province: "Punjab" },
  { name: "Sialkot",    province: "Punjab" },
  { name: "Hyderabad",  province: "Sindh" },
  { name: "Bahawalpur", province: "Punjab" },
] as const;

async function seedServiceAreas() {
  const existing = await db.select({ name: serviceAreasTable.name }).from(serviceAreasTable);
  const existingNames = new Set(existing.map((r) => r.name));
  let added = 0;
  for (let i = 0; i < CITIES.length; i++) {
    const c = CITIES[i];
    if (existingNames.has(c.name)) continue;
    await db.insert(serviceAreasTable).values({
      id: uid(),
      name: c.name,
      province: c.province,
      isActive: true,
      sortOrder: i + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    added++;
  }
  console.log(`  ✔ Service areas: ${added} added, ${existingNames.size} already existed`);
}

// ─── Platform Settings ────────────────────────────────────────────────────────

async function seedPlatformSettings() {
  const existing = await db.query.appSettingsTable.findFirst({
    where: eq(appSettingsTable.key, "platform"),
  });
  if (existing) { console.log("  ↳ Platform settings already exist"); return; }
  await db.insert(appSettingsTable).values({
    key: "platform",
    value: {
      commissionRate: 10,
      defaultCommissionLimit: 5000,
      platformName: "Athoo",
      supportPhone: "+92 339 0051068",
      supportEmail: "support@athoo.pk",
      maintenanceMode: false,
      defaultVisitCharge: 200,
      maxBookingsPerDay: 10,
      appVersion: "1.0.0",
      minBookingNoticeHours: 1,
      allowGuestBrowsing: true,
      providerAutoApprove: false,
      bookingCancellationWindowHours: 1,
    },
    updatedAt: new Date(),
  });
  console.log("  ✔ Platform settings seeded (commissionRate=10%, visitCharge=PKR 200)");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedDemoCustomer2() {
  const phone = "03485739871";
  if (await userExists(phone)) { console.log("  ↳ Demo customer #2 already exists"); return; }
  await db.insert(usersTable).values({
    id: uid(),
    name: "Sara Khan (Demo Customer)",
    phone,
    email: "sara.demo@athoo.com",
    role: "customer",
    password: await hashPw("123456"),
    verificationStatus: "pending",
    isVerified: false,
    isAvailable: false,
    isBlocked: false,
    isDeactivated: false,
    accountStatus: "active",
    location: "Lahore, Punjab",
    latitude: "31.5204",
    longitude: "74.3587",
    joinedAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("  ✔ Demo customer #2     phone=03485739871  password=123456");
}

async function seedDemoApprovedProvider2() {
  const phone = "03429699652";
  if (await userExists(phone)) { console.log("  ↳ Demo approved provider #2 already exists"); return; }
  await db.insert(usersTable).values({
    id: uid(),
    name: "Hamza Raza (Demo Provider)",
    phone,
    email: "hamza.demo@athoo.com",
    role: "provider",
    password: await hashPw("123456"),
    verificationStatus: "approved",
    isVerified: true,
    isAvailable: true,
    isBlocked: false,
    isDeactivated: false,
    accountStatus: "active",
    bio: "Certified electrician with 6 years of residential and commercial experience.",
    experience: "6 years",
    services: ["Electrician", "Wiring", "Appliance Repair"],
    ratePerHour: 900,
    rating: 42,
    ratingCount: 8,
    totalJobs: 24,
    location: "Lahore, Punjab",
    latitude: "31.5204",
    longitude: "74.3587",
    cnicNumber: "35202-8765432-3",
    joinedAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("  ✔ Approved provider #2 phone=03429699652  password=123456");
}

async function seedDemoPendingProvider3() {
  const phone = "03000000000";
  if (await userExists(phone)) { console.log("  ↳ Demo pending provider #3 already exists"); return; }
  await db.insert(usersTable).values({
    id: uid(),
    name: "Zain Ul Abideen (Pending)",
    phone,
    email: "zain.demo@athoo.com",
    role: "provider",
    password: await hashPw("123456"),
    verificationStatus: "pending",
    isVerified: false,
    isAvailable: false,
    isBlocked: false,
    isDeactivated: false,
    accountStatus: "active",
    bio: "Plumber looking to grow on Athoo platform.",
    experience: "3 years",
    services: ["Plumber", "Drainage"],
    ratePerHour: 700,
    location: "Islamabad, ICT",
    latitude: "33.6844",
    longitude: "73.0479",
    joinedAt: new Date(),
    updatedAt: new Date(),
  });
  console.log("  ✔ Pending provider #3  phone=03000000000   password=123456");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  console.log("\n🌱  ATHOO Database Seed\n");

  console.log("Users:");
  await seedAdmin();
  await seedCustomer();
  await seedPendingProvider();
  await seedApprovedProvider();
  await seedDemoCustomer2();
  await seedDemoApprovedProvider2();
  await seedDemoPendingProvider3();

  console.log("\nCategories:");
  await seedCategories();

  console.log("\nService Areas:");
  await seedServiceAreas();

  console.log("\nSettings:");
  await seedPlatformSettings();

  console.log("\n✅  Seed complete.\n");
  console.log("⚠️   IMPORTANT: Change the default admin password immediately.");
  console.log("    Admin → admin@athoo.com  |  03000000001  |  Admin@123\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
