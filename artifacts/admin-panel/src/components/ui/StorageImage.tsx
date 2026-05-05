import { getPrivateFileUrl } from "@/lib/storage";

interface StorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  objectPath: string | null | undefined;
  fallback?: React.ReactNode;
}

/**
 * Renders a private storage image by appending the admin token to the URL.
 * Works transparently with plain <img src> semantics — no custom fetch needed.
 * base64 data URIs and https URLs are passed through unchanged.
 * Returns fallback (or null) when objectPath is empty.
 */
export function StorageImage({ objectPath, fallback, alt, ...props }: StorageImageProps) {
  if (!objectPath) return fallback ? <>{fallback}</> : null;
  const src = getPrivateFileUrl(objectPath);
  return <img src={src} alt={alt ?? ""} {...props} />;
}
