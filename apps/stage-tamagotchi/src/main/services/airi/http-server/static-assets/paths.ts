import { realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/**
 * Parsed session-scoped plugin asset request route.
 *
 * @param extensionId Plugin extension identifier from the mounted route.
 * @param assetSessionId Asset session identifier from the mounted route.
 */
export interface ParsedStaticAssetRequest {
  /** Plugin extension identifier validated as one safe route segment. */
  extensionId: string
  /** Asset session identifier validated as one safe route segment. */
  assetSessionId: string
  /** Normalized plugin asset path relative to the mounted UI asset root. */
  assetPath: string
}

const pathPrefix = '/_airi/extensions/'
const segmentPattern = /^[\w.+-]+$/

function decodePathSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment)
  }
  catch {
    return undefined
  }
}

function isSafeRouteSegment(segment: string): boolean {
  return !segment.includes('/')
    && !segment.includes('\\')
    && segmentPattern.test(segment)
}

/**
 * Normalizes plugin asset paths into safe forward-slash relative paths.
 *
 * Use when:
 * - Accepting route asset paths before resolving files
 * - Building mounted asset URLs from plugin-owned asset paths
 *
 * Expects:
 * - Input may contain URL-encoded path segments
 * - Decoded segments must not introduce separators or traversal segments
 *
 * Returns:
 * - A slash-joined relative path, or `undefined` for empty, malformed, or traversal-like input
 *
 * Before:
 * - "dist\\ui\\file%20name.html"
 * - "safe%2F..%2Fsecret.txt"
 *
 * After:
 * - "dist/ui/file name.html"
 * - undefined
 */
export function normalizeStaticAssetPath(value: string): string | undefined {
  const normalized = value.trim().replaceAll('\\', '/')
  if (!normalized) {
    return undefined
  }

  const segments: string[] = []
  for (const rawSegment of normalized
    .split('/')
  ) {
    const decodedSegment = decodePathSegment(rawSegment)?.trim()
    if (decodedSegment == null) {
      return undefined
    }

    if (!decodedSegment) {
      continue
    }

    if (decodedSegment.includes('/') || decodedSegment.includes('\\')) {
      return undefined
    }

    segments.push(decodedSegment)
  }

  if (segments.length === 0) {
    return undefined
  }

  if (segments.some(segment => segment === '.' || segment === '..')) {
    return undefined
  }

  return segments.join('/')
}

/**
 * Parses one session-scoped mounted plugin asset request path.
 *
 * Use when:
 * - Handling `/_airi/extensions/:extensionId/sessions/:assetSessionId/ui/:assetPath` requests
 * - Rejecting malformed plugin asset routes before file resolution
 *
 * Expects:
 * - `pathname` is the URL pathname without query or hash
 * - Route identity segments are safe single path segments
 *
 * Returns:
 * - Parsed route fields with a normalized asset path, or `undefined` when the route is invalid
 */
export function parseStaticAssetRequestPath(pathname: string): ParsedStaticAssetRequest | undefined {
  if (!pathname.startsWith(pathPrefix)) {
    return undefined
  }

  const rawRemainder = pathname.slice(pathPrefix.length)
  if (!rawRemainder) {
    return undefined
  }

  const segments = rawRemainder.split('/')
  if (segments.length < 5) {
    return undefined
  }

  if (segments.includes('')) {
    return undefined
  }

  const extensionId = decodePathSegment(segments[0] ?? '')
  const sessionsSegment = decodePathSegment(segments[1] ?? '')
  const assetSessionId = decodePathSegment(segments[2] ?? '')
  const mountSegment = decodePathSegment(segments[3] ?? '')
  const rawAssetPath = segments.slice(4).join('/')

  if (
    extensionId == null
    || sessionsSegment == null
    || assetSessionId == null
    || mountSegment == null
    || !isSafeRouteSegment(extensionId)
    || sessionsSegment !== 'sessions'
    || !isSafeRouteSegment(assetSessionId)
    || mountSegment !== 'ui'
  ) {
    return undefined
  }

  const assetPath = normalizeStaticAssetPath(rawAssetPath)
  if (!assetPath) {
    return undefined
  }

  return {
    extensionId,
    assetSessionId,
    assetPath,
  }
}

/**
 * Resolves a normalized plugin asset path to a real file inside one plugin root.
 *
 * Use when:
 * - Serving mounted plugin assets from disk
 * - Preventing traversal and symlink escapes from the plugin asset root
 *
 * Expects:
 * - `rootDir` exists and can be resolved with `realpath`
 * - `assetPath` is route-relative user input and may still need normalization
 *
 * Returns:
 * - The candidate file's real path when it exists inside `rootDir`
 * - `undefined` when input is invalid, missing, or resolves outside `rootDir`
 */
export async function resolveStaticAssetFilePath(rootDir: string, assetPath: string) {
  const normalizedAssetPath = normalizeStaticAssetPath(assetPath)
  if (!normalizedAssetPath) {
    return undefined
  }

  const resolvedRoot = await realpath(rootDir)
  const resolvedCandidate = resolve(resolvedRoot, normalizedAssetPath)
  let realCandidate: string
  try {
    realCandidate = await realpath(resolvedCandidate)
  }
  catch {
    return undefined
  }

  const normalizedRootPrefix = `${resolvedRoot}${sep}`
  if (realCandidate !== resolvedRoot && !realCandidate.startsWith(normalizedRootPrefix)) {
    return undefined
  }

  return realCandidate
}

/**
 * Builds a session-scoped mounted plugin asset route path.
 *
 * Use when:
 * - Converting a validated plugin asset path into a mounted HTTP route
 * - Emitting URLs for `/_airi/extensions/:extensionId/sessions/:assetSessionId/ui/:assetPath`
 *
 * Expects:
 * - `extensionId` and `assetSessionId` are safe single route segments
 * - `assetPath` is a plugin-relative asset path accepted by {@link normalizeStaticAssetPath}
 *
 * Returns:
 * - Encoded mounted route path, or `undefined` when any input is unsafe
 */
export function buildMountedStaticAssetPath(input: {
  extensionId: string
  assetSessionId: string
  assetPath: string
}) {
  if (!isSafeRouteSegment(input.extensionId) || !isSafeRouteSegment(input.assetSessionId)) {
    return undefined
  }

  const normalizedAssetPath = normalizeStaticAssetPath(input.assetPath)
  if (!normalizedAssetPath) {
    return undefined
  }

  const encodedExtensionId = encodeURIComponent(input.extensionId)
  const encodedAssetSessionId = encodeURIComponent(input.assetSessionId)
  const encodedAssetPath = normalizedAssetPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

  return `${pathPrefix}${encodedExtensionId}/sessions/${encodedAssetSessionId}/ui/${encodedAssetPath}`
}
