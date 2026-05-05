/**
 * Cloudinary storage helpers for the ATHOO mobile app.
 *
 * Upload flow:
 *   1. Call getUploadParams() → get Cloudinary signed params from the API
 *   2. Call uploadFileToCloudinary(localUri, params, contentType) → POST to Cloudinary
 *   3. Returns the Cloudinary secure_url — save this as the objectPath
 *
 * Display flow:
 *   - objectPath is a full Cloudinary https:// URL — use it directly as <Image source={{ uri }} />
 *   - Use <PrivateImage objectPath={...} /> which handles both legacy /objects/ paths
 *     and new Cloudinary URLs transparently
 */
import React, { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getToken } from "@/services/api";

// ─── Resolve API base ─────────────────────────────────────────────────────────

function sanitizeBaseUrl(value: string | undefined | null): string {
  const raw = String(value || "").trim();
  return raw ? raw.replace(/\/$/, "") : "";
}

const _ENV_BASE =
  Constants?.expoConfig?.extra?.API_BASE_URL ||
  (Constants as any)?.manifest?.extra?.API_BASE_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "";

function _browserOrigin(): string {
  if (Platform.OS !== "web") return "";
  if (typeof window === "undefined" || !window.location) return "";
  return sanitizeBaseUrl(window.location.origin);
}

const _DEFAULT_LOCAL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export const STORAGE_API_BASE: string =
  sanitizeBaseUrl(_ENV_BASE) || _browserOrigin() || _DEFAULT_LOCAL;

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when the value is a stored objectPath (Cloudinary URL or legacy /objects/).
 */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value.startsWith("https://res.cloudinary.com/") ||
    value.startsWith("/objects/")
  );
}

/**
 * Returns the display URL for an objectPath.
 * - Cloudinary URLs: returned as-is (CDN delivery)
 * - Legacy /objects/ paths: proxied through the API (404 for pre-migration files)
 * - data: URIs and other https URLs: returned as-is
 */
export function getPrivateFileUrl(objectPath: string | null | undefined): string {
  if (!objectPath) return "";
  if (objectPath.startsWith("data:")) return objectPath;
  if (objectPath.startsWith("https://res.cloudinary.com/")) return objectPath;
  if (objectPath.startsWith("http")) return objectPath;
  // Legacy /objects/ path
  return `${STORAGE_API_BASE}/api/storage${objectPath}`;
}

/**
 * Returns the full URL for a public storage object.
 */
export function getPublicFileUrl(filePath: string | null | undefined): string {
  if (!filePath) return "";
  if (filePath.startsWith("http")) return filePath;
  return `${STORAGE_API_BASE}/api/storage/public-objects/${filePath.replace(/^\//, "")}`;
}

// ─── Cloudinary upload helpers ────────────────────────────────────────────────

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
 * Request Cloudinary signed upload params from the API server.
 */
export async function getUploadUrl(
  name: string,
  size: number,
  contentType: string,
): Promise<UploadUrlResult> {
  const token = await getToken();
  const res = await fetch(`${STORAGE_API_BASE}/api/storage/uploads/request-url`, {
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
 * Upload a file directly to Cloudinary using the signed params.
 * Returns the Cloudinary secure_url (the new objectPath).
 */
export async function uploadFileToCloudinary(
  localUri: string,
  params: CloudinaryParams,
  contentType: string,
): Promise<string> {
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();

  const formData = new FormData();
  formData.append("file", blob);
  formData.append("api_key", params.apiKey);
  formData.append("signature", params.signature);
  formData.append("timestamp", String(params.timestamp));
  formData.append("public_id", params.publicId);

  const uploadRes = await fetch(params.uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Cloudinary upload failed (${uploadRes.status}): ${errText}`);
  }

  const data = await uploadRes.json();
  if (!data.secure_url) {
    throw new Error("Cloudinary upload response missing secure_url");
  }
  return data.secure_url as string;
}

/**
 * Convenience: get signed params → upload to Cloudinary → return secure_url.
 * Drop-in replacement for the old uploadPickedImage().
 */
export async function uploadPickedImage(
  uri: string,
  filename = "image.jpg",
  contentType = "image/jpeg",
): Promise<string> {
  const result = await getUploadUrl(filename, 0, contentType);
  const secureUrl = await uploadFileToCloudinary(uri, result.cloudinary, contentType);
  return secureUrl;
}

// Legacy alias (still used in some screens)
export async function uploadFileToStorage(
  localUri: string,
  _uploadURL: string,
  contentType: string,
  cloudinaryParams?: CloudinaryParams,
): Promise<void> {
  if (!cloudinaryParams) {
    throw new Error("Cloudinary params required for upload");
  }
  await uploadFileToCloudinary(localUri, cloudinaryParams, contentType);
}

// ─── React Native component ───────────────────────────────────────────────────

interface PrivateImageProps {
  objectPath: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  fallback?: React.ReactNode;
  resizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
}

/**
 * Renders a storage image from either a Cloudinary URL or legacy /objects/ path.
 * For Cloudinary URLs: renders directly (no auth needed, CDN delivery).
 * For legacy paths: adds Authorization header.
 * Returns null (or `fallback`) when objectPath is empty.
 */
export function PrivateImage({
  objectPath,
  style,
  fallback,
  resizeMode = "cover",
}: PrivateImageProps): React.ReactElement | null {
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!objectPath) {
      setSource(null);
      return;
    }
    // Cloudinary or plain https URL — render directly, no auth needed
    if (
      objectPath.startsWith("data:") ||
      objectPath.startsWith("https://res.cloudinary.com/") ||
      objectPath.startsWith("http")
    ) {
      setSource({ uri: objectPath });
      return;
    }
    // Legacy /objects/ path — needs Authorization header
    const uri = getPrivateFileUrl(objectPath);
    getToken().then((token) => {
      setSource({ uri, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    });
  }, [objectPath]);

  if (!source) return fallback ? (fallback as React.ReactElement) : null;

  return React.createElement(Image, { source, style, resizeMode });
}
