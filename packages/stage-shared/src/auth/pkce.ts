const BASE64_PLUS = /\+/g
const BASE64_SLASH = /\//g
const BASE64_TRAILING_EQ = /=+$/

/**
 * Encode a byte array as a URL-safe base64 string (no padding).
 * Works in both Browser and Node.js (Electron main).
 */
export function base64UrlEncode(buffer: Uint8Array): string {
  let binary = ''
  for (const byte of buffer)
    binary += String.fromCharCode(byte)

  return btoa(binary)
    .replace(BASE64_PLUS, '-')
    .replace(BASE64_SLASH, '_')
    .replace(BASE64_TRAILING_EQ, '')
}

/**
 * Generate a cryptographically random code verifier (RFC 7636 S4.1).
 * 43-128 characters from the unreserved URL character set.
 */
export function generateCodeVerifier(length = 64): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/**
 * Derive a S256 code challenge from a code verifier (RFC 7636 S4.2).
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

/**
 * Generate a cryptographically random state parameter for CSRF protection.
 */
export function generateState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}
