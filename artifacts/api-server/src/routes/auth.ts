import { Router, type Response } from "express";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { usersTable, otpsTable, loginHistoryTable, adminBlacklistTable } from "@workspace/db/schema";
import { eq, and, gt, or, desc } from "drizzle-orm";
import { signToken, verifyToken, requireAuth, type AuthRequest } from "../middlewares/auth";
import { getPlatformSettings } from "../lib/admin";
// Rate limiting is handled globally by express-rate-limit in app.ts
import { sendEmail, renderOtpEmail } from "../lib/email";
import * as bcrypt from "bcryptjs";
import crypto from "crypto";

const router = Router();

function generateOtp(): string {
  return crypto.randomInt(1000, 10000).toString();
}

function generateId(): string {
  return crypto.randomUUID();
}

async function sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;
  const waPhone = phone.startsWith("0") ? `92${phone.slice(1)}` : phone.replace(/^\+/, "");
  try {
    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waPhone,
        type: "template",
        template: {
          name: "otp_verification",
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
        },
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("3") && digits.length === 10) return `0${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return digits;

  return phone.trim();
}

function cleanRole(role?: string): "customer" | "provider" | null {
  if (role === "customer" || role === "provider") return role;
  return null;
}

function cleanEmail(email?: string): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  return v ? v : null;
}

function toSafeUser<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

router.post("/send-otp", async (req, res) => {
  try {
    const { phone, email } = req.body as { phone?: string; email?: string };

    if (!phone || phone.trim().length < 10) {
      res.status(400).json({ error: "Valid phone number required" });
      return;
    }

    const normalizedPhone = cleanPhone(phone);
    const normalizedEmail = cleanEmail(email);
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpsTable).values({
      id: generateId(),
      phone: normalizedPhone,
      code,
      expiresAt,
      used: false,
    });

    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      // Auth OTPs are intentionally surfaced via the console (and the response
      // body) when no SMS provider is configured, so the system stays usable
      // out-of-the-box for local + self-hosted deployments.
      logger.info(`[auth-otp] phone=${normalizedPhone} code=${code} (expires in 10m)`);
    }

    // Best-effort WhatsApp OTP — only sends if WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set.
    const waSent = await sendWhatsAppOTP(normalizedPhone, code).catch(() => false);
    if (waSent) logger.info({ phone: normalizedPhone }, "WhatsApp OTP sent");

    // Best-effort email — only sends if SMTP is configured AND we have an
    // email to send to. Falls back to phone-only delivery silently otherwise.
    let emailChannel: "smtp" | "console" | null = null;
    const targetEmail = normalizedEmail || (await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    }))?.email || null;
    if (targetEmail) {
      const t = renderOtpEmail(code, "Verification");
      const r = await sendEmail({ to: targetEmail, subject: t.subject, html: t.html, text: t.text });
      emailChannel = r.channel;
    }

    res.json({
      success: true,
      emailSent: emailChannel === "smtp",
      whatsappSent: waSent,
      ...(isDev ? { code, message: "OTP sent (dev mode: code returned and logged to server console)" } : {}),
      ...(!isDev ? { message: waSent ? "OTP sent to your WhatsApp" : emailChannel === "smtp" ? "OTP sent to your phone and email" : "OTP sent to your phone number" } : {}),
    });
  } catch (e) {
    logger.error({ err: e }, "send-otp error");
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, code } = req.body as { phone: string; code: string };

    if (!phone || !code) {
      res.status(400).json({ error: "Phone and OTP required" });
      return;
    }

    const normalizedPhone = cleanPhone(phone);

    const otp = await db.query.otpsTable.findFirst({
      where: and(
        eq(otpsTable.phone, normalizedPhone),
        eq(otpsTable.code, code.trim()),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, new Date())
      ),
      orderBy: desc(otpsTable.createdAt),
    });

    if (!otp) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }

    await db
      .update(otpsTable)
      .set({ used: true })
      .where(eq(otpsTable.id, otp.id));

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (user) {
      if (user.isDeactivated) {
        res
          .status(403)
          .json({ error: "This account has been deactivated. Please contact support." });
        return;
      }

      const token = signToken({ userId: user.id, role: user.role, adminRole: user.adminRole ?? undefined, adminPermissions: Array.isArray(user.adminPermissions) ? user.adminPermissions as string[] : [] });
      db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role, method: "otp", success: true, ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});
      res.json({
        success: true,
        token,
        user: toSafeUser(user),
        isNewUser: false,
      });
      return;
    }

    res.json({
      success: true,
      token: null,
      user: null,
      isNewUser: true,
    });
  } catch (e) {
    logger.error({ err: e }, "verify-otp error");
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { name, phone, email, role, services, password } = req.body as {
      name: string;
      phone: string;
      email?: string;
      role: string;
      services?: string[];
      password?: string;
    };

    if (!name || !phone || !role) {
      res.status(400).json({ error: "Name, phone and role required" });
      return;
    }

    const normalizedPhone = cleanPhone(phone);
    const normalizedEmail = cleanEmail(email);
    const normalizedRole = cleanRole(role);

    if (!normalizedPhone || normalizedPhone.length < 10) {
      res.status(400).json({ error: "Valid phone number required" });
      return;
    }

    if (!normalizedRole) {
      res.status(400).json({ error: "Role must be customer or provider" });
      return;
    }

    const existingByPhone = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (existingByPhone) {
      res.status(400).json({ error: "Account already exists with this phone number" });
      return;
    }

    if (normalizedEmail) {
      const existingByEmail = await db.query.usersTable.findFirst({
        where: eq(usersTable.email, normalizedEmail),
      });

      if (existingByEmail) {
        res.status(400).json({ error: "Account already exists with this email address" });
        return;
      }
    }

    // Check admin blacklist — block phone and email if listed
    const phoneBlacklisted = await db.query.adminBlacklistTable.findFirst({
      where: and(eq(adminBlacklistTable.isActive, true), eq(adminBlacklistTable.value, normalizedPhone)),
    });
    const emailBlacklisted = normalizedEmail
      ? await db.query.adminBlacklistTable.findFirst({
          where: and(eq(adminBlacklistTable.isActive, true), eq(adminBlacklistTable.value, normalizedEmail)),
        })
      : null;

    if (phoneBlacklisted || emailBlacklisted) {
      res.status(403).json({ error: "Registration is not permitted for this account. Please contact support." });
      return;
    }

    let hashedPassword: string | null = null;

    if (typeof password === "string" && password.trim().length > 0) {
      if (password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Generate a unique short referral code (e.g. ATH-X4K9J2)
    const referralCode = `ATH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    // Handle referredBy — if a referral code was provided, look up the referrer
    let referredByUserId: string | null = null;
    const providedReferralCode = typeof req.body.referralCode === "string" ? req.body.referralCode.trim().toUpperCase() : null;
    if (providedReferralCode) {
      const referrer = await db.query.usersTable.findFirst({ where: eq(usersTable.referralCode, providedReferralCode) });
      if (referrer) {
        referredByUserId = referrer.id;
        // Increment referrer's count (non-fatal)
        db.update(usersTable).set({ referralCount: (referrer.referralCount || 0) + 1 }).where(eq(usersTable.id, referrer.id)).catch(() => {});
      }
    }

    // Check providerAutoApprove platform setting
    let autoApproved = false;
    if (normalizedRole === "provider") {
      try {
        const settings = await getPlatformSettings();
        autoApproved = Boolean(settings.providerAutoApprove);
      } catch {
        // Non-fatal — fall back to manual approval
      }
    }

    const newUser = {
      id: generateId(),
      name: name.trim(),
      phone: normalizedPhone,
      role: normalizedRole,
      email: normalizedEmail,
      services: Array.isArray(services) ? services : [],
      password: hashedPassword,
      profileColor: role === "provider" ? "#FF6B1A" : "#1A6EE0",
      isVerified: autoApproved,
      verificationStatus: autoApproved ? "approved" : "pending",
      isAvailable: true,
      rating: 0,
      ratingCount: 0,
      totalJobs: 0,
      isDeactivated: false,
      referralCode,
      referredBy: referredByUserId,
      referralCount: 0,
    };

    await db.insert(usersTable).values(newUser);

    const token = signToken({ userId: newUser.id, role: newUser.role });

    res.json({
      success: true,
      token,
      user: toSafeUser(newUser),
    });
  } catch (e) {
    logger.error({ err: e }, "register error");
    res.status(500).json({ error: "Failed to register" });
  }
});

router.patch("/push-token", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const expoPushToken = typeof (req.body as any)?.expoPushToken === "string" ? (req.body as any).expoPushToken.trim() : "";

    await db.update(usersTable).set({
      expoPushToken: expoPushToken || null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.user!.userId));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "save push token error");
    res.status(500).json({ error: "Failed to save push token" });
  }
});

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: toSafeUser(user) });
  } catch (e) {
    logger.error({ err: e }, "get me error");
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.patch("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      email,
      bio,
      experience,
      services,
      location,
      profileImage,
      profileColor,
      isAvailable,
      ratePerHour,
      maxTravelDistanceKm,
      role,
    } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = cleanEmail(email);
    if (bio !== undefined) updates.bio = bio;
    if (experience !== undefined) updates.experience = experience;
    if (services !== undefined) updates.services = services;
    if (location !== undefined) updates.location = location;
    if (profileImage !== undefined) updates.profileImage = profileImage;
    if (profileColor !== undefined) updates.profileColor = profileColor;
    if (isAvailable !== undefined) updates.isAvailable = isAvailable;
    if (ratePerHour !== undefined) {
      updates.ratePerHour = ratePerHour === null ? null : Number(ratePerHour) || null;
    }
    if (maxTravelDistanceKm !== undefined) {
      updates.maxTravelDistanceKm = maxTravelDistanceKm === null ? null : Number(maxTravelDistanceKm) || null;
    }
    if (role !== undefined) {
      const normalizedRole = cleanRole(String(role));
      if (!normalizedRole) {
        res.status(400).json({ error: "Role must be customer or provider" });
        return;
      }
      updates.role = normalizedRole;
    }

    await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.user!.userId));

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });

    res.json({ user: toSafeUser(user) });
  } catch (e) {
    logger.error({ err: e }, "update me error");
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// DELETE /auth/me — permanently delete account
router.delete("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(usersTable).where(eq(usersTable.id, req.user!.userId));
    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "delete me error");
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// POST /auth/deactivate — deactivate account (keep data, prevent login)
router.post("/deactivate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .update(usersTable)
      .set({ isDeactivated: true, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));

    res.json({ success: true });
  } catch (e) {
    logger.error({ err: e }, "deactivate error");
    res.status(500).json({ error: "Failed to deactivate account" });
  }
});

// GET /auth/users/:id — get public profile of any user
router.get("/users/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.params.id as string),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: toSafeUser(user) });
  } catch (e) {
    logger.error({ err: e }, "get user error");
    res.status(500).json({ error: "Failed to get user" });
  }
});

// POST /auth/login — sign in with email/phone + password
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body as {
      identifier: string;
      password: string;
    };

    if (!identifier || !password) {
      res.status(400).json({ error: "Email/phone and password are required" });
      return;
    }

    const normalizedIdentifier = identifier.trim();
    const normalizedPhone = cleanPhone(normalizedIdentifier);
    const normalizedEmail = normalizedIdentifier.toLowerCase();

    const user = await db.query.usersTable.findFirst({
      where: or(
        eq(usersTable.phone, normalizedPhone),
        eq(usersTable.phone, normalizedIdentifier),
        eq(usersTable.email, normalizedEmail)
      ),
    });

    if (!user) {
      res.status(401).json({ error: "No account found with this email or phone number" });
      return;
    }

    if (user.isDeactivated) {
      res
        .status(403)
        .json({ error: "This account has been deactivated. Please contact support." });
      return;
    }

    if (!user.password) {
      res.status(401).json({
        error:
          "This account uses OTP login. Please sign in with your phone number and OTP instead.",
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role, method: "password", success: false, failReason: "Incorrect password", ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});
      res.status(401).json({ error: "Incorrect password. Please try again." });
      return;
    }

    const token = signToken({ userId: user.id, role: user.role, adminRole: user.adminRole ?? undefined, adminPermissions: Array.isArray(user.adminPermissions) ? user.adminPermissions as string[] : [] });

    db.insert(loginHistoryTable).values({ id: generateId(), userId: user.id, phone: user.phone, email: user.email, role: user.role, method: "password", success: true, ipAddress: req.ip, userAgent: req.headers["user-agent"] || null }).catch(() => {});

    res.json({
      success: true,
      token,
      user: toSafeUser(user),
    });
  } catch (e) {
    logger.error({ err: e }, "login error");
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /auth/set-password — set or change password (authenticated)
router.post("/set-password", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword: string;
    };

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, req.user!.userId),
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.password) {
      if (!currentPassword) {
        res
          .status(400)
          .json({ error: "Current password is required to set a new password" });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, user.password);

      if (!valid) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await db
      .update(usersTable)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));

    res.json({ success: true, message: "Password set successfully" });
  } catch (e) {
    logger.error({ err: e }, "set-password error");
    res.status(500).json({ error: "Failed to set password" });
  }
});
// ==
// FORGOT PASSWORD FLOW
// ==

// 1. Send reset OTP
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.trim().length < 10) {
      return res.status(400).json({ error: "Valid phone required" });
    }

    const normalizedPhone = cleanPhone(phone);

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (!user) {
      return res.status(404).json({ error: "No account found with this phone number" });
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpsTable).values({
      id: generateId(),
      phone: normalizedPhone,
      code,
      expiresAt,
      used: false,
    });

    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      logger.info(`[auth-otp/reset] phone=${normalizedPhone} code=${code} (expires in 10m)`);
    }

    let emailChannel: "smtp" | "console" | null = null;
    if (user.email) {
      const t = renderOtpEmail(code, "Password reset");
      const r = await sendEmail({ to: user.email, subject: t.subject, html: t.html, text: t.text });
      emailChannel = r.channel;
    }

    res.json({
      success: true,
      emailSent: emailChannel === "smtp",
      ...(isDev ? { code, message: "Reset OTP sent (dev mode: code returned and logged to server console)" } : { message: emailChannel === "smtp" ? "Reset OTP sent to your phone and email" : "Reset OTP sent to your phone number" }),
    });
    return;
  } catch (e) {
    logger.error({ err: e }, "forgot send otp error");
    res.status(500).json({ error: "Failed to send OTP" });
    return;
  }
});

// 2. Verify reset OTP — marks OTP used and issues a short-lived signed reset token
router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: "Phone and OTP required" });
    }

    const normalizedPhone = cleanPhone(phone);

    const otp = await db.query.otpsTable.findFirst({
      where: and(
        eq(otpsTable.phone, normalizedPhone),
        eq(otpsTable.code, code.trim()),
        eq(otpsTable.used, false),
        gt(otpsTable.expiresAt, new Date())
      ),
      orderBy: desc(otpsTable.createdAt),
    });

    if (!otp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    await db
      .update(otpsTable)
      .set({ used: true })
      .where(eq(otpsTable.id, otp.id));

    // Issue a short-lived reset token — step 3 MUST present this to prove OTP was verified.
    // Without it, any caller who knows a phone number could skip to step 3.
    const resetToken = signToken({ userId: `reset:${normalizedPhone}`, role: "reset", purpose: "password_reset" } as any);

    res.json({ success: true, resetToken });
    return;
  } catch (e) {
    logger.error({ err: e }, "forgot verify otp error");
    res.status(500).json({ error: "Failed to verify OTP" });
    return;
  }
});

// 3. Reset password — requires the signed resetToken issued by step 2
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Valid reset token and password (min 8 chars) required" });
    }

    // Verify the reset token and extract phone — reject any caller without it
    const tokenPayload = verifyToken(resetToken);
    if (!tokenPayload || (tokenPayload as any).role !== "reset" || (tokenPayload as any).purpose !== "password_reset") {
      return res.status(400).json({ error: "Reset token is invalid or expired. Please start over." });
    }
    const normalizedPhone = String(tokenPayload.userId || "").replace("reset:", "");
    if (!normalizedPhone) {
      return res.status(400).json({ error: "Invalid reset token payload" });
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.phone, normalizedPhone),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await db
      .update(usersTable)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    res.json({ success: true, message: "Password reset successful" });
    return;
  } catch (e) {
    logger.error({ err: e }, "reset password error");
    res.status(500).json({ error: "Failed to reset password" });
    return;
  }
});
// ==
// SWITCH ROLE (Customer <-> Provider)
// ==
router.post("/switch-role", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const requestedRole = cleanRole((req.body as { role?: string } | undefined)?.role);
    const newRole = requestedRole || (user.role === "customer" ? "provider" : "customer");

    if (newRole === user.role) {
      const token = signToken({ userId: user.id, role: user.role, adminRole: user.adminRole ?? undefined, adminPermissions: Array.isArray(user.adminPermissions) ? user.adminPermissions as string[] : [] });
      return res.json({ success: true, token, user: toSafeUser(user) });
    }

    if (newRole === "provider") {
      const hasProviderProfile =
        (Array.isArray(user.services) && user.services.length > 0) ||
        Boolean(user.bio && user.bio.trim()) ||
        Boolean(user.experience && user.experience.trim()) ||
        typeof user.ratePerHour === "number";

      if (!hasProviderProfile) {
        return res.status(400).json({
          error: "PROVIDER_PROFILE_REQUIRED",
          message: "You do not have a provider account yet. Please complete provider registration first.",
        });
      }
    }

    const updateFields: Record<string, unknown> = {
      role: newRole,
      updatedAt: new Date(),
    };

    // Security: if switching customer → provider, reset verificationStatus to "pending".
    // This prevents a previously-approved provider from toggling roles to skip re-verification.
    if (newRole === "provider" && user.role !== "provider") {
      updateFields.verificationStatus = "pending";
    }

    await db
      .update(usersTable)
      .set(updateFields as any)
      .where(eq(usersTable.id, userId));

    const updatedUser = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });

    const token = signToken({
      userId: updatedUser!.id,
      role: updatedUser!.role,
      adminRole: updatedUser!.adminRole ?? undefined,
      adminPermissions: Array.isArray(updatedUser!.adminPermissions) ? updatedUser!.adminPermissions as string[] : [],
    });

    return res.json({
      success: true,
      token,
      user: toSafeUser(updatedUser),
    });
  } catch (e) {
    logger.error({ err: e }, "switch role error");
    return res.status(500).json({ error: "Failed to switch role" });
  }
});

export default router;

