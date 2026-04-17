/**
 * Validation constants for user routes.
 *
 * Avatar operations use multipart form data (no JSON body schema).
 * Account deletion requires only auth (no request body).
 */

/** Allowed MIME types for avatar uploads. */
export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/** Maximum avatar file size in bytes (5 MB). */
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024

/**
 * Maps image MIME type to file extension for S3 object keys.
 *
 * Before:
 * - "image/jpeg"
 *
 * After:
 * - "jpg"
 */
export const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
