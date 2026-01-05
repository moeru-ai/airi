/**
 * Simple nanoid implementation to avoid dependencies
 */
export function nanoid(size = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'
  let id = ''
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length]
  }
  return id
}
