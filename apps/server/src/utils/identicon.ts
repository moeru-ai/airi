import { toPng } from 'jdenticon'

/**
 * Generates a deterministic identicon PNG image for a given user ID.
 *
 * Use when:
 * - Generating a default avatar for a new user during registration
 * - Providing a fallback avatar when no profile image is set
 * - Producing a unique, visually distinct image per user
 *
 * Expects:
 * - `userId` is a non-empty string (typically a UUID or similar unique identifier)
 * - The same `userId` always produces the same output (deterministic)
 *
 * Returns:
 * - A `Promise<Buffer>` resolving to a 256×256 PNG image buffer
 * - The buffer always starts with the PNG magic bytes `[137, 80, 78, 71, 13, 10, 26, 10]`
 */
export async function generateIdenticon(userId: string): Promise<Buffer> {
  // toPng is synchronous; wrapping in Promise for a consistent async interface
  // that consumers (e.g. avatar upload service) can await without refactoring.
  const png = toPng(userId, 256)
  return png
}
