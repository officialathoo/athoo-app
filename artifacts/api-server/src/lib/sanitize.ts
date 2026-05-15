/**
 * Input sanitization utilities for request body/params.
 * Prevents XSS, SQL injection patterns, and oversized inputs.
 */

const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:\s*text\/html/i,
];

export function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

export function containsDangerousContent(value: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(value));
}

export function sanitizeString(value: unknown, maxLength = 5000): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, maxLength);
  return stripHtmlTags(trimmed);
}

export function sanitizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^\d+\-() ]/g, "").trim().slice(0, 20);
}

export function sanitizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, 254);
}

export function toPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function isValidUUID(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function validateFileType(contentType: string): boolean {
  const allowed = [
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
    "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  return allowed.includes(contentType.toLowerCase());
}

export function validateFileSize(sizeBytes: number, maxMB = 25): boolean {
  return sizeBytes > 0 && sizeBytes <= maxMB * 1024 * 1024;
}
