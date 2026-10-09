// Shared path rules for the custom MCP servers.
// They hide files that can hold secrets and refuse paths outside an allowed root.

import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

// Names that can hold secrets, or that are too big to be useful.
const BLOCKED_SEGMENTS = new Set(['.git', 'node_modules', '.open-next', '.next', '.turbo', 'account-info.md', 'settings.local.json', 'id_rsa', 'id_ed25519'])
const BLOCKED_PATTERNS = [/^\.env(?!\.example$)(\..*)?$/i, /\.local\.md$/i, /\.(pem|key|p12|pfx)$/i]
const BLOCKED_PATH_PARTS = [`.claude${sep}local`]

/** Git pathspecs that keep the same secret files out of git output. */
export const GIT_SECRET_EXCLUDES = [':(exclude,glob)**/.env', ':(exclude,glob)**/.env.*', ':(exclude,glob)**/*.local.md', ':(exclude,glob)**/account-info.md']

/** Returns true when one path segment names a blocked file or folder. */
export function isBlockedName(name) {
  return BLOCKED_SEGMENTS.has(name.toLowerCase()) || BLOCKED_PATTERNS.some(pattern => pattern.test(name))
}

/** Returns true when a path relative to its root contains a blocked segment. */
export function isBlockedRelativePath(rel) {
  return rel.split(/[\\/]/).some(isBlockedName) || BLOCKED_PATH_PARTS.some(part => rel.includes(part))
}

/**
 * Resolves a user path inside one root. It refuses escapes, symlink escapes, and secret files.
 * Returns the real path and the path relative to the root.
 */
export async function resolveInsideRoot(root, userPath = '.') {
  const real = await realpath(resolve(root, userPath))
  const rel = relative(await realpath(root), real)
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('Đường dẫn nằm ngoài thư mục được phép.')
  if (isBlockedRelativePath(rel))
    throw new Error('File hoặc thư mục này bị chặn vì có thể chứa bí mật.')
  return { real, rel: rel || '.' }
}

/** Resolves an absolute user path inside the first matching root of a list. */
export async function resolveInsideAnyRoot(roots, userPath) {
  for (const root of roots) {
    try {
      return { root, ...await resolveInsideRoot(root, userPath) }
    }
    catch (error) {
      if (!String(error?.message).includes('ngoài thư mục'))
        throw error
    }
  }
  throw new Error(`Đường dẫn không nằm trong thư mục được phép: ${roots.join(', ')}`)
}
