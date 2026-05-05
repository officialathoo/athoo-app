import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const _jwtSecretRaw = process.env["JWT_SECRET"] || process.env["SESSION_SECRET"];
if (!_jwtSecretRaw) {
  throw new Error("FATAL: JWT_SECRET environment variable is required. Server cannot start without it.");
}
const JWT_SECRET: string = _jwtSecretRaw;

export interface JwtPayload {
  userId: string;
  role: string;
  adminRole?: string;
  adminPermissions?: string[];
}

export interface AuthRequest extends Omit<Request, "params"> {
  user?: JwtPayload;
  params: { [key: string]: string };
}

export function signToken(payload: JwtPayload, expiresIn?: string): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: (expiresIn ?? "30d") as any });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

async function loadUserFromToken(decoded: JwtPayload) {
  return db.query.usersTable.findFirst({
    where: eq(usersTable.id, decoded.userId),
  });
}

function accountError(user: any, opts?: { allowDeactivated?: boolean }): { status: number; error: string } | null {
  if (!user) {
    return { status: 401, error: "Account not found" };
  }

  if (user.isDeactivated && !opts?.allowDeactivated) {
    return { status: 403, error: "This account has been deactivated. Please contact support." };
  }

  if (user.isBlocked) {
    return {
      status: 403,
      error: user.blockedReason || "This account has been blocked. Please contact support.",
    };
  }

  return null;
}

function buildAuthMiddleware(opts: { allowDeactivated?: boolean } = {}) {
  return async function (req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const user = await loadUserFromToken(decoded);
      const userError = accountError(user, opts);
      if (userError) {
        res.status(userError.status).json({ error: userError.error });
        return;
      }

      req.user = {
        userId: user!.id,
        role: user!.role,
        adminRole: user!.adminRole ?? undefined,
        adminPermissions: Array.isArray(user!.adminPermissions) ? (user!.adminPermissions as string[]) : [],
      };

      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

export const requireAuth = buildAuthMiddleware();
// Use this for endpoints that must remain available to deactivated/pending-deletion
// users — for example to cancel a pending deletion or to reactivate the account.
export const requireAuthAllowDeactivated = buildAuthMiddleware({ allowDeactivated: true });

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  if (req.user.adminRole !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    if (req.user.adminRole === "super_admin") {
      next();
      return;
    }
    const perms = req.user.adminPermissions || [];
    if (!perms.includes(permission)) {
      res.status(403).json({ error: `Permission required: ${permission}` });
      return;
    }
    next();
  };
}

