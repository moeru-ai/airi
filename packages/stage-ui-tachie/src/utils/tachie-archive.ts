import { errorMessageFrom } from '@moeru/std'
import { unzip } from 'fflate'

import { DEFAULT_TACHIE_EMOTION, isTachieEmotion, TACHIE_EMOTIONS } from '../constants/emotions'

/** Required compound extension for locally imported Tachie archives. */
export const TACHIE_ARCHIVE_SUFFIX = '.tachie.zip'
/** Maximum compressed ZIP size accepted by the loader. */
export const MAX_TACHIE_ARCHIVE_BYTES = 100 * 1024 * 1024

/** One recognized emotion image in its original archive location. */
export interface TachieArchiveEntry {
  /** AIRI emotion selected by the filename stem. */
  emotion: typeof TACHIE_EMOTIONS[number]
  /** Normalized path used to read the image from the ZIP. */
  path: string
}

/**
 * The normalized, deterministic file mapping derived from a Tachie archive.
 */
export interface TachieArchiveLayout {
  /** Recognized images in deterministic emotion order. */
  entries: TachieArchiveEntry[]
  /** Structural errors that make the archive unusable. */
  errors: string[]
  /** Non-protocol files retained for the import audit report. */
  ignoredEntries: string[]
  /** Single directory containing all emotion images, when present. */
  wrappingDirectory?: string
}

/** Browser-decoded source accepted by Pixi and the preview canvas. */
export type TachieImageSource = ImageBitmap | HTMLImageElement

/** A decoded emotion image owned by a loaded Tachie asset set. */
export interface TachieDecodedImage {
  /** Emotion represented by this complete character image. */
  emotion: typeof TACHIE_EMOTIONS[number]
  /** Source ZIP path for diagnostics. */
  path: string
  /** Decoded browser image, valid until `dispose()` is called. */
  source: TachieImageSource
  /** Decoded width in physical pixels. */
  width: number
  /** Decoded height in physical pixels. */
  height: number
  /** Releases the decoded browser resource. */
  dispose: () => void
}

/** Fully decoded, dimension-checked images ready for an atomic model switch. */
export interface TachieLoadedAssets {
  /** Recognized images keyed by AIRI emotion. */
  images: Map<typeof TACHIE_EMOTIONS[number], TachieDecodedImage>
  /** Shared width of every recognized image in physical pixels. */
  width: number
  /** Shared height of every recognized image in physical pixels. */
  height: number
  /** Non-protocol files found during archive inspection. */
  ignoredEntries: string[]
  /** Non-blocking import audit messages. */
  warnings: string[]
  /** Combined decoded RGBA texture footprint in bytes. */
  decodedImageBytes: number
  /** Releases every decoded image owned by this asset set. */
  dispose: () => void
}

/** Outcome shown before a local Tachie archive is imported. */
export type TachieValidationStatus = 'VALID' | 'WARNING' | 'INVALID'

/** Complete local import audit result without retained image resources. */
export interface TachieValidationReport {
  /** Whether import is direct, needs confirmation, or is blocked. */
  status: TachieValidationStatus
  /** Original local filename. */
  fileName: string
  /** Compressed archive size in bytes. */
  archiveBytes: number
  /** Combined decoded RGBA texture footprint in bytes. */
  decodedImageBytes: number
  /** Shared image dimensions when every recognized image decoded successfully. */
  canvas?: {
    /** Shared decoded width in physical pixels. */
    width: number
    /** Shared decoded height in physical pixels. */
    height: number
  }
  /** Recognized emotion images. */
  detected: TachieArchiveEntry[]
  /** Non-protocol archive entries that will not be rendered. */
  ignoredEntries: string[]
  /** Blocking archive or image errors. */
  errors: string[]
  /** Non-blocking findings that require import confirmation. */
  warnings: string[]
}

/** Optional policy overrides for loading Tachie archives. */
export interface TachieArchiveLoadOptions {
  /** Filename used for suffix validation and diagnostics. */
  fileName?: string
  /**
   * Whether `fileName` must end in `.tachie.zip`.
   *
   * @default false
   */
  requireTachieSuffix?: boolean
  /**
   * Device texture dimension cap; omitted values are queried from WebGL.
   *
   * @default Current browser WebGL `MAX_TEXTURE_SIZE`
   */
  maxTextureSize?: number
}

interface TachieArchiveInspection {
  assets?: TachieLoadedAssets
  archiveBytes: number
  detected: TachieArchiveEntry[]
  errors: string[]
  ignoredEntries: string[]
  warnings: string[]
}

function normalizedArchivePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

function archivePathSegments(path: string): string[] {
  return normalizedArchivePath(path).split('/').filter(Boolean)
}

function shouldIgnoreArchiveMetadata(path: string): boolean {
  return archivePathSegments(path).some(segment =>
    segment === '__MACOSX'
    || segment === '.DS_Store'
    || segment.startsWith('._'),
  )
}

function emotionFromFileName(fileName: string) {
  const extensionSeparator = fileName.lastIndexOf('.')
  const stem = (extensionSeparator > 0 ? fileName.slice(0, extensionSeparator) : fileName).toLowerCase()
  return isTachieEmotion(stem) ? stem : undefined
}

/**
 * Resolves emotion images and the optional single wrapping directory.
 *
 * Before:
 * - `["Character/Neutral.PNG", "Character/happy.webp"]`
 *
 * After:
 * - `{ wrappingDirectory: "Character", entries: [{ emotion: "happy", ... }, { emotion: "neutral", ... }] }`
 */
export function resolveTachieArchiveLayout(paths: string[]): TachieArchiveLayout {
  const errors: string[] = []
  const meaningfulPaths = paths
    .map(normalizedArchivePath)
    .filter(path => path && !shouldIgnoreArchiveMetadata(path))
  const candidates = meaningfulPaths
    .map((path) => {
      const segments = archivePathSegments(path)
      const emotion = emotionFromFileName(segments.at(-1) ?? '')
      return emotion ? { emotion, path, segments } : undefined
    })
    .filter(candidate => candidate !== undefined)

  const rootCandidates = candidates.filter(candidate => candidate.segments.length === 1)
  const wrappedCandidates = candidates.filter(candidate => candidate.segments.length === 2)
  const deeplyNestedCandidates = candidates.filter(candidate => candidate.segments.length > 2)

  if (deeplyNestedCandidates.length > 0)
    errors.push('Emotion images must be stored at the archive root or inside one wrapping directory.')

  if (rootCandidates.length > 0 && wrappedCandidates.length > 0)
    errors.push('Emotion images cannot be mixed between the archive root and a wrapping directory.')

  const wrappingDirectories = new Set(wrappedCandidates.map(candidate => candidate.segments[0]))
  if (wrappingDirectories.size > 1)
    errors.push('All emotion images must use the same wrapping directory.')

  const wrappingDirectory = rootCandidates.length === 0 && wrappingDirectories.size === 1
    ? [...wrappingDirectories][0]
    : undefined

  for (const candidate of candidates) {
    const segments = candidate.segments
    const matchesLayout = wrappingDirectory
      ? segments.length === 2 && segments[0] === wrappingDirectory
      : segments.length === 1
    if (!matchesLayout) {
      errors.push(wrappingDirectory
        ? `Emotion image "${candidate.path}" is outside the "${wrappingDirectory}" wrapping directory.`
        : `Emotion image "${candidate.path}" is nested; only root-level files are allowed.`)
    }
  }

  const entryByEmotion = new Map<typeof TACHIE_EMOTIONS[number], TachieArchiveEntry>()
  for (const candidate of candidates) {
    const existing = entryByEmotion.get(candidate.emotion)
    if (existing) {
      errors.push(`Emotion "${candidate.emotion}" is provided more than once: "${existing.path}" and "${candidate.path}".`)
      continue
    }
    entryByEmotion.set(candidate.emotion, { emotion: candidate.emotion, path: candidate.path })
  }

  if (!entryByEmotion.has(DEFAULT_TACHIE_EMOTION))
    errors.push('Tachie archive must contain a neutral image.')

  const entries = TACHIE_EMOTIONS
    .map(emotion => entryByEmotion.get(emotion))
    .filter(entry => entry !== undefined)
  const recognizedPaths = new Set(entries.map(entry => entry.path))
  const ignoredEntries = meaningfulPaths.filter(path => !recognizedPaths.has(path))

  return {
    entries,
    errors: [...new Set(errors)],
    ignoredEntries,
    wrappingDirectory,
  }
}

function imageDimensions(source: TachieImageSource) {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }
}

async function decodeImage(blob: Blob): Promise<{ source: TachieImageSource, dispose: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const source = await createImageBitmap(blob)
    return {
      source,
      dispose: () => source.close(),
    }
  }

  const objectUrl = URL.createObjectURL(blob)
  const source = new Image()
  try {
    source.src = objectUrl
    await source.decode()
  }
  finally {
    URL.revokeObjectURL(objectUrl)
  }

  return {
    source,
    dispose: () => {
      source.src = ''
    },
  }
}

function maxTextureSizeFromBrowser(): number {
  if (typeof document === 'undefined')
    return Number.MAX_SAFE_INTEGER

  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  if (!gl)
    return 0

  return gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
}

function disposeDecodedImages(images: Iterable<TachieDecodedImage>) {
  for (const image of images)
    image.dispose()
}

function extractTachieArchive(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    try {
      unzip(data, {
        filter: file => !file.name.endsWith('/') && !file.name.endsWith('\\'),
      }, (error, files) => {
        if (error) {
          reject(error)
          return
        }
        resolve(files)
      })
    }
    catch (error) {
      reject(error)
    }
  })
}

async function inspectTachieArchive(
  input: Blob | ArrayBuffer,
  options: TachieArchiveLoadOptions = {},
): Promise<TachieArchiveInspection> {
  const errors: string[] = []
  const warnings: string[] = []
  const archiveBytes = input instanceof Blob ? input.size : input.byteLength

  if (options.requireTachieSuffix && options.fileName && !options.fileName.toLowerCase().endsWith(TACHIE_ARCHIVE_SUFFIX))
    errors.push(`Tachie archives must use the ${TACHIE_ARCHIVE_SUFFIX} file extension.`)
  if (archiveBytes > MAX_TACHIE_ARCHIVE_BYTES)
    errors.push('Tachie archive exceeds the 100 MiB compressed size limit.')
  if (errors.length > 0)
    return { archiveBytes, detected: [], errors, ignoredEntries: [], warnings }

  let archiveFiles: Record<string, Uint8Array>
  try {
    const data = input instanceof Blob
      ? await input.arrayBuffer().then(buffer => new Uint8Array(buffer))
      : new Uint8Array(input)
    archiveFiles = await extractTachieArchive(data)
  }
  catch (error) {
    return {
      archiveBytes,
      detected: [],
      errors: [`Failed to read Tachie archive: ${errorMessageFrom(error) ?? 'invalid ZIP data'}`],
      ignoredEntries: [],
      warnings,
    }
  }

  const layout = resolveTachieArchiveLayout(Object.keys(archiveFiles))
  errors.push(...layout.errors)
  if (layout.ignoredEntries.length > 0)
    warnings.push(`Ignored ${layout.ignoredEntries.length} unrecognized archive ${layout.ignoredEntries.length === 1 ? 'entry' : 'entries'}.`)
  if (errors.length > 0) {
    return {
      archiveBytes,
      detected: layout.entries,
      errors,
      ignoredEntries: layout.ignoredEntries,
      warnings,
    }
  }

  const maxTextureSize = options.maxTextureSize ?? maxTextureSizeFromBrowser()
  if (maxTextureSize <= 0) {
    errors.push('WebGL is unavailable, so Tachie textures cannot be rendered.')
    return {
      archiveBytes,
      detected: layout.entries,
      errors,
      ignoredEntries: layout.ignoredEntries,
      warnings,
    }
  }

  const extractedImagesByPath = new Map(
    Object.entries(archiveFiles).map(([path, bytes]) => [normalizedArchivePath(path), bytes]),
  )

  const images = new Map<typeof TACHIE_EMOTIONS[number], TachieDecodedImage>()
  let width = 0
  let height = 0
  let decodedImageBytes = 0

  for (const entry of layout.entries) {
    const bytes = extractedImagesByPath.get(entry.path)
    if (!bytes) {
      errors.push(`Missing archive entry "${entry.path}".`)
      continue
    }

    try {
      const blob = new Blob([Uint8Array.from(bytes).buffer])
      const decoded = await decodeImage(blob)
      const dimensions = imageDimensions(decoded.source)
      if (dimensions.width <= 0 || dimensions.height <= 0) {
        decoded.dispose()
        errors.push(`Image "${entry.path}" has invalid dimensions.`)
        continue
      }
      if (dimensions.width > maxTextureSize || dimensions.height > maxTextureSize) {
        decoded.dispose()
        errors.push(`Image "${entry.path}" is ${dimensions.width}×${dimensions.height}, exceeding this device's ${maxTextureSize}px texture limit.`)
        continue
      }

      decodedImageBytes += dimensions.width * dimensions.height * 4

      if (width === 0 && height === 0) {
        width = dimensions.width
        height = dimensions.height
      }
      else if (dimensions.width !== width || dimensions.height !== height) {
        decoded.dispose()
        errors.push(`Image "${entry.path}" is ${dimensions.width}×${dimensions.height}; every Tachie image must match ${width}×${height}.`)
        continue
      }

      images.set(entry.emotion, {
        ...entry,
        ...decoded,
        ...dimensions,
      })
    }
    catch (error) {
      errors.push(`Failed to decode image "${entry.path}": ${errorMessageFrom(error) ?? 'unsupported image data'}.`)
    }
  }

  if (!images.has(DEFAULT_TACHIE_EMOTION))
    errors.push('The neutral image could not be decoded.')

  if (errors.length > 0) {
    disposeDecodedImages(images.values())
    return {
      archiveBytes,
      detected: layout.entries,
      errors: [...new Set(errors)],
      ignoredEntries: layout.ignoredEntries,
      warnings,
    }
  }

  const assets: TachieLoadedAssets = {
    images,
    width,
    height,
    ignoredEntries: layout.ignoredEntries,
    warnings,
    decodedImageBytes,
    dispose: () => disposeDecodedImages(images.values()),
  }

  return {
    assets,
    archiveBytes,
    detected: layout.entries,
    errors,
    ignoredEntries: layout.ignoredEntries,
    warnings,
  }
}

/**
 * Loads and fully decodes every recognized emotion image in a Tachie ZIP.
 *
 * The returned image sources remain owned by the caller until `dispose()` is
 * called. A failed archive never returns a partially usable model.
 */
export async function loadTachieZip(
  input: Blob | ArrayBuffer,
  options: TachieArchiveLoadOptions = {},
): Promise<TachieLoadedAssets> {
  const inspection = await inspectTachieArchive(input, options)
  if (!inspection.assets)
    throw new Error(inspection.errors.join(' '))
  return inspection.assets
}

/**
 * Validates a local `.tachie.zip` without retaining decoded image resources.
 */
export async function validateTachieZip(file: File): Promise<TachieValidationReport> {
  const inspection = await inspectTachieArchive(file, {
    fileName: file.name,
    requireTachieSuffix: true,
  })
  const assets = inspection.assets
  const report: TachieValidationReport = {
    status: inspection.errors.length > 0
      ? 'INVALID'
      : inspection.warnings.length > 0
        ? 'WARNING'
        : 'VALID',
    fileName: file.name,
    archiveBytes: inspection.archiveBytes,
    decodedImageBytes: assets?.decodedImageBytes ?? 0,
    canvas: assets ? { width: assets.width, height: assets.height } : undefined,
    detected: inspection.detected,
    ignoredEntries: inspection.ignoredEntries,
    errors: inspection.errors,
    warnings: inspection.warnings,
  }
  assets?.dispose()
  return report
}
