// NOTICE: 64 chars is a power of 2, so `byte % 64` introduces no modulo bias.
// 21 chars at 6 bits each = 126 bits of entropy, sufficient for collision resistance.
export const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'
export const NANOID_DEFAULT_SIZE = 21

/**
 * Simple nanoid implementation to avoid dependencies.
 * Generates a URL-safe, cryptographically random ID.
 */
export function nanoid(size = NANOID_DEFAULT_SIZE): string {
  let id = ''
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  for (let i = 0; i < size; i++) {
    id += NANOID_ALPHABET[bytes[i] % NANOID_ALPHABET.length]
  }
  return id
}
