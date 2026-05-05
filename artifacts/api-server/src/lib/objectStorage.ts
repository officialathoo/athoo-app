/**
 * Cloudinary-backed object storage for ATHOO.
 *
 * Upload flow (client-side direct upload):
 *   1. Client calls POST /api/storage/uploads/request-url
 *   2. Server returns a Cloudinary signed upload signature + params
 *   3. Client POSTs multipart/form-data directly to Cloudinary upload API
 *   4. Cloudinary returns { secure_url, public_id }
 *   5. Client stores the secure_url as the objectPath
 *
 * Display flow:
 *   - objectPath is a full Cloudinary https URL → render directly, no proxy
 *   - Legacy /objects/… paths are still recognised and served via redirect
 */

import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";
import { logger } from "./logger";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const API_KEY = process.env.CLOUDINARY_API_KEY || "";
const API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface CloudinaryUploadParams {
  uploadUrl: string;
  apiKey: string;
  signature: string;
  timestamp: number;
  folder: string;
  publicId: string;
}

export class ObjectStorageService {
  /**
   * Generate a signed Cloudinary upload signature.
   * The client uses these params to POST directly to Cloudinary.
   */
  getSignedUploadParams(folder = "athoo/uploads"): CloudinaryUploadParams {
    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      throw new Error("Cloudinary credentials not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
    }

    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${folder}/${randomUUID()}`;

    const paramsToSign = { timestamp, public_id: publicId };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, API_SECRET);

    return {
      uploadUrl: CLOUDINARY_UPLOAD_URL,
      apiKey: API_KEY,
      signature,
      timestamp,
      folder,
      publicId,
    };
  }

  /**
   * Delete a Cloudinary asset by its public_id.
   * public_id is derived from the secure_url.
   */
  async deleteObject(secureUrl: string): Promise<void> {
    try {
      const publicId = this.urlToPublicId(secureUrl);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (err) {
      logger.error({ err }, "cloudinary delete failed");
    }
  }

  /**
   * Returns true when the value is a Cloudinary URL or legacy /objects/ path.
   */
  isObjectPath(value: string | null | undefined): boolean {
    if (!value) return false;
    return value.startsWith("https://res.cloudinary.com/") || value.startsWith("/objects/");
  }

  /**
   * For legacy /objects/<id> paths: redirect to a placeholder or 404.
   * New paths are full Cloudinary URLs and need no serving.
   */
  isLegacyPath(value: string): boolean {
    return value.startsWith("/objects/");
  }

  /**
   * Extract Cloudinary public_id from a secure_url.
   * e.g. https://res.cloudinary.com/da2ayrh4l/image/upload/v123/athoo/uploads/uuid.jpg
   *       → athoo/uploads/uuid
   */
  urlToPublicId(secureUrl: string): string | null {
    try {
      const url = new URL(secureUrl);
      const parts = url.pathname.split("/");
      const uploadIdx = parts.indexOf("upload");
      if (uploadIdx === -1) return null;
      // skip version segment (v12345) if present
      const afterUpload = parts.slice(uploadIdx + 1);
      const startIdx = afterUpload[0]?.match(/^v\d+$/) ? 1 : 0;
      const withExt = afterUpload.slice(startIdx).join("/");
      return withExt.replace(/\.[^/.]+$/, "");
    } catch {
      return null;
    }
  }
}
