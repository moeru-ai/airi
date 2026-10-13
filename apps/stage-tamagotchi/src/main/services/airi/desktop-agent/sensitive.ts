import { isAbsolute, relative, resolve } from 'node:path'

/**
 * Credential and settings paths the agent never reads or writes.
 *
 * This is a second gate behind the workspace boundary. Some of these live
 * inside the workspace by accident, such as a project-local `.npmrc` or
 * `.git-credentials`, and the agent must not be able to read a token just
 * because a file happens to sit under the working directory.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])\.gnupg([\\/]|$)/i,
  /(^|[\\/])\.git-credentials$/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.netrc$/i,
  /(^|[\\/])id_(rsa|ed25519|ecdsa)(\.pub)?$/i,
  /(^|[\\/])(Login Data|Cookies|Web Data)$/i,
  /(^|[\\/])(Google[\\/]Chrome|Microsoft[\\/]Edge|Mozilla[\\/]Firefox)/i,
  /(^|[\\/])\.credentials\.yaml$/i,
]

/** Reports whether an absolute path holds credentials or settings. */
export function isSensitivePath(absolutePath: string): boolean {
  const path = String(absolutePath ?? '')
  if (!path)
    return false
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(path))
}

/**
 * Resolves a target against a root and refuses anything that leaves it.
 *
 * The executor applies the same rule in the renderer. It runs again here
 * because this process is the one that touches the disk, and the renderer side
 * runs model-supplied input.
 */
export function resolveInsideRoot(root: string, target: string): string {
  const base = resolve(root)
  const absolute = isAbsolute(target) ? resolve(target) : resolve(base, target)
  const inside = absolute === base || !relative(base, absolute).startsWith('..')
  if (!inside) {
    const error = new Error(`Path escapes the workspace: ${target}`)
    Object.assign(error, { code: 'OUTSIDE_WORKSPACE' })
    throw error
  }
  return absolute
}
