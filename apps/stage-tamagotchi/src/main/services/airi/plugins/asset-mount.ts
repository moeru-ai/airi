import { realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export interface ParsedPluginAssetRequest {
  extensionId: string
  assetPath: string
}

const pathPrefix = '/_airi/extensions/'
const segmentPattern = /^[\w.+-]+$/

export function normalizePluginAssetPath(value: string): string | undefined {
  const normalized = value.trim().replaceAll('\\', '/')
  if (!normalized) {
    return undefined
  }

  const segments = normalized
    .split('/')
    .map(segment => decodeURIComponent(segment).trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return undefined
  }

  if (segments.some(segment => segment === '.' || segment === '..')) {
    return undefined
  }

  return segments.join('/')
}

export function parsePluginAssetRequestPath(pathname: string): ParsedPluginAssetRequest | undefined {
  if (!pathname.startsWith(pathPrefix)) {
    return undefined
  }

  const rawRemainder = pathname.slice(pathPrefix.length)
  if (!rawRemainder) {
    return undefined
  }

  const segments = rawRemainder.split('/').filter(Boolean)
  if (segments.length < 3) {
    return undefined
  }

  const extensionId = decodeURIComponent(segments[0] ?? '')
  const mountSegment = decodeURIComponent(segments[1] ?? '')
  const rawAssetPath = segments.slice(2).join('/')

  if (!segmentPattern.test(extensionId) || mountSegment !== 'ui') {
    return undefined
  }

  const assetPath = normalizePluginAssetPath(rawAssetPath)
  if (!assetPath) {
    return undefined
  }

  return {
    extensionId,
    assetPath,
  }
}

export async function resolvePluginAssetFilePath(rootDir: string, assetPath: string) {
  const normalizedAssetPath = normalizePluginAssetPath(assetPath)
  if (!normalizedAssetPath) {
    return undefined
  }

  const resolvedRoot = await realpath(rootDir)
  const resolvedCandidate = resolve(resolvedRoot, normalizedAssetPath)
  const normalizedRootPrefix = `${resolvedRoot}${sep}`
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(normalizedRootPrefix)) {
    return undefined
  }

  return resolvedCandidate
}

export function buildMountedPluginAssetPath(input: {
  extensionId: string
  assetPath: string
}) {
  const normalizedAssetPath = normalizePluginAssetPath(input.assetPath)
  if (!normalizedAssetPath) {
    return undefined
  }

  const encodedExtensionId = encodeURIComponent(input.extensionId)
  const encodedAssetPath = normalizedAssetPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

  return `${pathPrefix}${encodedExtensionId}/ui/${encodedAssetPath}`
}
