import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { getPlatformSettings } from "./lib/admin";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const corsOrigin = process.env.CORS_ORIGIN?.trim();
const replitDomains = (process.env.REPLIT_DOMAINS || "")
  .split(",")
  .map((d) => `https://${d.trim()}`)
  .filter(Boolean);

app.use(
  cors({
    origin:
      corsOrigin && corsOrigin !== "*"
        ? corsOrigin.split(",").map((item) => item.trim()).filter(Boolean)
        : process.env.NODE_ENV === "production" && replitDomains.length > 0
          ? replitDomains
          : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown): string {
  return safeString(value).replace(/\s+/g, "");
}

function normalizeEmail(value: unknown): string {
  return safeString(value).toLowerCase();
}

function normalizeIdentifier(value: unknown): string {
  return safeString(value).toLowerCase();
}

function requestIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown-ip";
}

function authKey(prefix: string, identity: string, req: Request): string {
  const cleanIdentity = identity.trim().toLowerCase();
  if (cleanIdentity) return `${prefix}:${cleanIdentity}`;
  return `${prefix}:ip:${requestIp(req)}`;
}

const rateLimitConfig = (keyFn: (req: Request) => string) => ({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === "GET",
  keyGenerator: keyFn,
});

app.use(
  "/api/auth/send-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("send-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many OTP requests. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/verify-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("verify-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many OTP verification attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/forgot-password/send-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("forgot-send-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many password reset OTP requests. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/forgot-password/verify-otp",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("forgot-verify-otp", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many OTP verification attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/forgot-password/reset",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("forgot-reset", normalizePhone(req.body?.phone), req),
    ),
    message: { error: "Too many password reset attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/login",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey("login", normalizeIdentifier(req.body?.identifier), req),
    ),
    message: { error: "Too many login attempts. Please try again in 15 minutes." },
  }),
);

app.use(
  "/api/auth/register",
  rateLimit({
    ...rateLimitConfig((req) =>
      authKey(
        "register",
        normalizePhone(req.body?.phone) || normalizeEmail(req.body?.email),
        req,
      ),
    ),
    message: { error: "Too many registration attempts. Please try again in 15 minutes." },
  }),
);

// Maintenance mode — cached for 60 s to avoid a DB round-trip on every request.
// Admin routes (/api/admin/*) and health checks are always allowed through.
let _maintenanceCache: { enabled: boolean; fetchedAt: number } = { enabled: false, fetchedAt: 0 };
const MAINTENANCE_TTL_MS = 60_000;

async function isMaintenanceEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - _maintenanceCache.fetchedAt < MAINTENANCE_TTL_MS) {
    return _maintenanceCache.enabled;
  }
  try {
    const settings = await getPlatformSettings();
    _maintenanceCache = { enabled: Boolean(settings.maintenanceMode), fetchedAt: now };
  } catch {
    // Fall back to cached value on DB error — never block in case of DB outage
  }
  return _maintenanceCache.enabled;
}

app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Allow health checks and admin routes through regardless
  const path = req.path || "";
  if (
    path === "/" ||
    path.startsWith("/api/health") ||
    path.startsWith("/api/admin") ||
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/register")
  ) {
    return next();
  }
  try {
    const enabled = await isMaintenanceEnabled();
    if (enabled) {
      res.status(503).json({
        error: "Athoo is currently under maintenance. Please try again shortly.",
        maintenanceMode: true,
      });
      return;
    }
  } catch {
    // On unexpected error, let request through
  }
  next();
});

// Health / root routes
app.get("/", (_req, res) => {
  res.send("Athoo API is running 🚀");
});

app.get("/api", (_req, res) => {
  res.json({
    status: "ok",
    message: "Athoo API is running 🚀",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "athoo-api",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Main API routes
app.use("/api", router);

// Global error handler — catches any unhandled errors thrown from route handlers.
// Must be registered after all routes (Express identifies it by the 4-arg signature).
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "unhandled route error");
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
