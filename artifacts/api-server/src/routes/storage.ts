import { Router, type IRouter, type Request, type Response } from "express";
import { RequestUploadUrlBody } from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { verifyToken } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Extract JWT from the request — checks Authorization header first, then the
 * `?token=` query param so that browser <img src="…?token=…"> tags work.
 */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  if (typeof req.query.token === "string" && req.query.token) return req.query.token;
  return null;
}

/**
 * POST /storage/uploads/request-url
 *
 * Returns Cloudinary signed upload parameters.
 * The client uses these to POST directly to Cloudinary (no server proxy).
 * Requires a valid JWT.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const params = objectStorageService.getSignedUploadParams("athoo/uploads");

    res.json({
      // Legacy field — now contains the Cloudinary upload endpoint
      uploadURL: params.uploadUrl,
      // objectPath will be set by the client after upload (the Cloudinary secure_url)
      objectPath: null,
      // Cloudinary-specific fields the client needs to sign the upload
      cloudinary: {
        apiKey: params.apiKey,
        signature: params.signature,
        timestamp: params.timestamp,
        publicId: params.publicId,
        uploadUrl: params.uploadUrl,
      },
      metadata: { name, size, contentType },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating Cloudinary upload params");
    res.status(500).json({ error: "Failed to generate upload parameters" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Legacy route: for old /objects/<id> paths stored before Cloudinary migration.
 * Returns 404 — these files no longer exist. New uploads use Cloudinary URLs directly.
 */
router.get("/storage/objects/*path", (req: Request, res: Response) => {
  res.status(404).json({ error: "Legacy storage path — file no longer available" });
});

/**
 * GET /storage/public-objects/*
 *
 * Legacy route: kept for backward compatibility. Returns 404.
 */
router.get("/storage/public-objects/*filePath", (req: Request, res: Response) => {
  res.status(404).json({ error: "Legacy storage path — use Cloudinary URLs directly" });
});

export default router;
