/**
 * Cloudinary storage helpers for the ATHOO admin panel.
 *
 * Upload flow:
 *   1. Call uploadFile(file) → secureUrl (Cloudinary https URL)
 *   2. Save secureUrl to the API as the objectPath
 *
 * Display:
 *   - Cloudinary URLs are used directly as <img src> — no auth or proxy needed
 *   - Legacy /objects/ paths are proxied through the API (token appended as before)
 */
import { getApiBase, getToken } from "@/lib/api";

export type CloudinaryParams = {
  apiKey: string;
  signature: string;
  timestamp: number;
  publicId: string;
  uploadUrl: string;
};

export type UploadUrlResult = {
  uploadURL: string;
  objectPath: string | null;
  cloudinary: CloudinaryParams;
};

/**
 * Returns true when value is a stored objectPath (Cloudinary URL or legacy /objects/…).
 */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value.startsWith("https://res.cloudinary.com/") ||
    value.startsWith("/objects/")
  );
}

/**
 * Build the display URL for an objectPath.
 * - Cloudinary URLs: returned as-is (CDN, no auth)
 * - Legacy /objects/ paths: proxied through API with ?token=
 * - data: URIs / other https URLs: returned as-is
 */
export function getPrivateFileUrl(objectPath: string | null | undefined): string {
  if (!objectPath) return "";
  if (objectPath.startsWith("data:")) return objectPath;
  if (objectPath.startsWith("https://res.cloudinary.com/")) return objectPath;
  if (objectPath.startsWith("http")) return objectPath;
  // Legacy /objects/ path — append token
  const token = getToken();
  const base = getApiBase();
  const url = `${base}/api/storage${objectPath}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

/**
 * Build the URL for a public storage object.
 */
export function getPublicFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  if (filePath.startsWith("http")) return filePath;
  const base = getApiBase();
  return `${base}/api/storage/public-objects/${filePath.replace(/^\//, "")}`;
}

/**
 * Request Cloudinary signed upload params from the API server.
 */
export async function getUploadUrl(
  name: string,
  size: number,
  contentType: string,
): Promise<UploadUrlResult> {
  const token = getToken();
  const base = getApiBase();
  const res = await fetch(`${base}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name, size, contentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `Failed to get upload params (${res.status})`);
  }
  return res.json() as Promise<UploadUrlResult>;
}

/**
 * Upload a browser File directly to Cloudinary using signed params.
 * Returns the Cloudinary secure_url.
 */
export async function uploadFileToCloudinary(
  file: File | Blob,
  params: CloudinaryParams,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", params.apiKey);
  formData.append("signature", params.signature);
  formData.append("timestamp", String(params.timestamp));
  formData.append("public_id", params.publicId);

  const res = await fetch(params.uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!data.secure_url) throw new Error("Cloudinary upload response missing secure_url");
  return data.secure_url as string;
}

/**
 * Convenience: upload a browser File and return the Cloudinary secure_url.
 * Drop-in replacement for the old uploadFile().
 */
export async function uploadFile(file: File): Promise<string> {
  const mime = file.type || "application/octet-stream";
  const result = await getUploadUrl(file.name, file.size, mime);
  return uploadFileToCloudinary(file, result.cloudinary);
}

// Legacy alias for backward compat
export async function uploadFileToStorage(
  file: File | Blob,
  _uploadURL: string,
  _contentType: string,
  cloudinaryParams?: CloudinaryParams,
): Promise<void> {
  if (!cloudinaryParams) throw new Error("Cloudinary params required");
  await uploadFileToCloudinary(file, cloudinaryParams);
}
