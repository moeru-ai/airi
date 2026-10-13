/**
 * Path handling for the agent executor.
 *
 * The executor runs in the renderer, where the bundler replaces `node:path`
 * with an empty stub. Importing it there fails at run time with
 * "resolve is not a function", so the few operations the executor needs live
 * here, on strings.
 *
 * A Windows path and a POSIX path are both accepted. The separator that the
 * input uses is the one the output keeps.
 */

/** Reports whether a path starts with a Windows drive letter or a root slash. */
export function isAbsolutePath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\') || path.startsWith('/')
}

/** Collapses `.` and `..` segments, and keeps the separator style of the input. */
export function normalizePath(path: string): string {
  const value = String(path ?? '')
  const windows = value.includes('\\')
  const separator = windows ? '\\' : '/'

  const drive = /^([a-z]:)/i.exec(value)?.[1] ?? ''
  const rooted = !drive && (value.startsWith('/') || value.startsWith('\\'))
  const segments = value
    .slice(drive.length)
    .split(/[\\/]+/)
    .filter(segment => segment.length > 0 && segment !== '.')

  const stack: string[] = []
  for (const segment of segments) {
    if (segment === '..') {
      // A leading `..` on a relative path is meaningful, so it is kept.
      if (stack.length === 0 || stack[stack.length - 1] === '..')
        stack.push(segment)
      else
        stack.pop()
      continue
    }
    stack.push(segment)
  }

  const body = stack.join(separator)
  if (drive)
    return body ? `${drive}${separator}${body}` : `${drive}${separator}`
  if (rooted)
    return `${separator}${body}`

  return body || '.'
}

/**
 * Resolves a target against a root.
 *
 * An absolute target is normalized on its own, because that is what a caller
 * that already resolved the path expects.
 */
export function resolvePath(root: string, target: string): string {
  const value = String(target ?? '').trim()
  if (isAbsolutePath(value))
    return normalizePath(value)

  const base = String(root ?? '').trim()
  if (!base)
    return normalizePath(value)

  const separator = base.includes('\\') ? '\\' : '/'
  return normalizePath(`${base}${separator}${value === '' ? '.' : value}`)
}

/**
 * Reports whether an absolute path sits inside a root.
 *
 * The comparison is case-insensitive, because Windows paths are.
 */
export function isInsidePath(absolute: string, root: string): boolean {
  const normalize = (path: string) => normalizePath(path).replace(/[\\/]+$/, '').toLowerCase()
  const target = normalize(absolute)
  const base = normalize(root)

  return target === base || target.startsWith(`${base}/`) || target.startsWith(`${base}\\`)
}

/**
 * Reports the path of a target relative to a root, for display.
 *
 * A target outside the root is returned unchanged, so the caller never shows a
 * misleading relative path.
 */
export function relativeToWorkspace(root: string, absolute: string): string {
  const base = normalizePath(root).replace(/[\\/]+$/, '')
  const target = normalizePath(absolute)

  if (!isInsidePath(target, base))
    return target.replace(/\\/g, '/')

  const rest = target.slice(base.length).replace(/^[\\/]+/, '')
  return rest.replace(/\\/g, '/') || '.'
}
