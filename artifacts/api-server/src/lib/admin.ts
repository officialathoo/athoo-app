import crypto from "crypto";
import { db } from "@workspace/db";
import { appSettingsTable, usersTable, type User } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "platform";

export type PlatformSettings = {
  commissionRate: number;
  defaultCommissionLimit: number;
  platformName: string;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultVisitCharge: number;
  maxBookingsPerDay: number;
  appVersion: string;
  minBookingNoticeHours: number;
  allowGuestBrowsing: boolean;
  providerAutoApprove: boolean;
  bookingCancellationWindowHours: number;
  // Broadcast
  broadcastTTLMinutes: number;
  // Negotiation
  maxNegotiationRounds: number;
  // Premium
  premiumCommissionDiscountPercent: number;
  premiumPriorityBoost: boolean;
  premiumProfileBadgeEnabled: boolean;
  // Service area
  defaultServiceRadiusKm: number;
  // Cancellation fees
  customerCancellationFee: number;
  providerCancellationPenalty: number;
};

export function generateId(): string {
  return crypto.randomUUID();
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
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
  broadcastTTLMinutes: 30,
  maxNegotiationRounds: 3,
  premiumCommissionDiscountPercent: 0,
  premiumPriorityBoost: true,
  premiumProfileBadgeEnabled: true,
  defaultServiceRadiusKm: 25,
  customerCancellationFee: 0,
  providerCancellationPenalty: 0,
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await db.query.appSettingsTable.findFirst({
    where: eq(appSettingsTable.key, SETTINGS_KEY),
  });

  if (!row || typeof row.value !== "object" || row.value === null) {
    await db.insert(appSettingsTable).values({
      key: SETTINGS_KEY,
      value: DEFAULT_PLATFORM_SETTINGS,
      updatedAt: new Date(),
    }).onConflictDoNothing();
    return DEFAULT_PLATFORM_SETTINGS;
  }

  const v = row.value as Record<string, unknown>;

  function num(key: string, def: number): number {
    const n = Number(v[key]);
    return Number.isFinite(n) ? n : def;
  }
  function bool(key: string, def: boolean): boolean {
    return v[key] !== undefined ? Boolean(v[key]) : def;
  }
  function str(key: string, def: string): string {
    return String(v[key] || def);
  }

  return {
    commissionRate: num("commissionRate", DEFAULT_PLATFORM_SETTINGS.commissionRate),
    defaultCommissionLimit: num("defaultCommissionLimit", DEFAULT_PLATFORM_SETTINGS.defaultCommissionLimit),
    platformName: str("platformName", DEFAULT_PLATFORM_SETTINGS.platformName),
    supportPhone: str("supportPhone", DEFAULT_PLATFORM_SETTINGS.supportPhone),
    supportEmail: str("supportEmail", DEFAULT_PLATFORM_SETTINGS.supportEmail),
    maintenanceMode: bool("maintenanceMode", DEFAULT_PLATFORM_SETTINGS.maintenanceMode),
    defaultVisitCharge: num("defaultVisitCharge", DEFAULT_PLATFORM_SETTINGS.defaultVisitCharge),
    maxBookingsPerDay: num("maxBookingsPerDay", DEFAULT_PLATFORM_SETTINGS.maxBookingsPerDay),
    appVersion: str("appVersion", DEFAULT_PLATFORM_SETTINGS.appVersion),
    minBookingNoticeHours: num("minBookingNoticeHours", DEFAULT_PLATFORM_SETTINGS.minBookingNoticeHours),
    allowGuestBrowsing: bool("allowGuestBrowsing", DEFAULT_PLATFORM_SETTINGS.allowGuestBrowsing),
    providerAutoApprove: bool("providerAutoApprove", DEFAULT_PLATFORM_SETTINGS.providerAutoApprove),
    bookingCancellationWindowHours: num("bookingCancellationWindowHours", DEFAULT_PLATFORM_SETTINGS.bookingCancellationWindowHours),
    broadcastTTLMinutes: num("broadcastTTLMinutes", DEFAULT_PLATFORM_SETTINGS.broadcastTTLMinutes),
    maxNegotiationRounds: num("maxNegotiationRounds", DEFAULT_PLATFORM_SETTINGS.maxNegotiationRounds),
    premiumCommissionDiscountPercent: num("premiumCommissionDiscountPercent", DEFAULT_PLATFORM_SETTINGS.premiumCommissionDiscountPercent),
    premiumPriorityBoost: bool("premiumPriorityBoost", DEFAULT_PLATFORM_SETTINGS.premiumPriorityBoost),
    premiumProfileBadgeEnabled: bool("premiumProfileBadgeEnabled", DEFAULT_PLATFORM_SETTINGS.premiumProfileBadgeEnabled),
    defaultServiceRadiusKm: num("defaultServiceRadiusKm", DEFAULT_PLATFORM_SETTINGS.defaultServiceRadiusKm),
    customerCancellationFee: num("customerCancellationFee", DEFAULT_PLATFORM_SETTINGS.customerCancellationFee),
    providerCancellationPenalty: num("providerCancellationPenalty", DEFAULT_PLATFORM_SETTINGS.providerCancellationPenalty),
  };
}

export async function savePlatformSettings(input: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const current = await getPlatformSettings();

  function takeNum(key: keyof PlatformSettings): number {
    const v = input[key];
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? n : (current[key] as number);
  }
  function takeBool(key: keyof PlatformSettings): boolean {
    return input[key] !== undefined ? Boolean(input[key]) : (current[key] as boolean);
  }
  function takeStr(key: keyof PlatformSettings): string {
    return input[key] !== undefined ? String(input[key]) : (current[key] as string);
  }

  const next: PlatformSettings = {
    commissionRate: takeNum("commissionRate"),
    defaultCommissionLimit: takeNum("defaultCommissionLimit"),
    platformName: takeStr("platformName"),
    supportPhone: takeStr("supportPhone"),
    supportEmail: takeStr("supportEmail"),
    maintenanceMode: takeBool("maintenanceMode"),
    defaultVisitCharge: takeNum("defaultVisitCharge"),
    maxBookingsPerDay: takeNum("maxBookingsPerDay"),
    appVersion: takeStr("appVersion"),
    minBookingNoticeHours: takeNum("minBookingNoticeHours"),
    allowGuestBrowsing: takeBool("allowGuestBrowsing"),
    providerAutoApprove: takeBool("providerAutoApprove"),
    bookingCancellationWindowHours: takeNum("bookingCancellationWindowHours"),
    broadcastTTLMinutes: takeNum("broadcastTTLMinutes"),
    maxNegotiationRounds: takeNum("maxNegotiationRounds"),
    premiumCommissionDiscountPercent: takeNum("premiumCommissionDiscountPercent"),
    premiumPriorityBoost: takeBool("premiumPriorityBoost"),
    premiumProfileBadgeEnabled: takeBool("premiumProfileBadgeEnabled"),
    defaultServiceRadiusKm: takeNum("defaultServiceRadiusKm"),
    customerCancellationFee: takeNum("customerCancellationFee"),
    providerCancellationPenalty: takeNum("providerCancellationPenalty"),
  };

  await db.insert(appSettingsTable).values({
    key: SETTINGS_KEY,
    value: next,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: appSettingsTable.key,
    set: { value: next, updatedAt: new Date() },
  });

  return next;
}

export function toPublicProvider(user: User | null | undefined) {
  if (!user) return null;
  // IMPORTANT: Financial fields (pendingCommission, totalCommission, commissionLimit)
  // and block status must NOT be exposed to customers or other providers —
  // only the provider themselves and admins should see them.
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage,
    profileColor: user.profileColor,
    bio: user.bio,
    experience: user.experience,
    services: user.services,
    location: user.location,
    isVerified: user.isVerified,
    isAvailable: user.isAvailable,
    rating: user.rating,
    ratingCount: user.ratingCount,
    totalJobs: user.totalJobs,
    ratePerHour: user.ratePerHour,
    joinedAt: user.joinedAt,
  };
}

export function toSafeUser<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

