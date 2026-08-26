import type { UrlModifier } from '../composables/mmd/loader'

import JSZip from 'jszip'

export interface MMDLoadedAssets {
  /** Blob URLs for every archive entry, keyed by in-archive path. */
  blobUrls: Record<string, string>
  /** Revokes every blob URL allocated for this load. */
  dispose: () => void
  /** Blob URL for the primary model file, passed to `MMDLoader.load`. */
  modelBlobUrl: string
  /**
   * Resolves an in-PMX texture reference to a blob URL.
   *
   * Install on the loader's `LoadingManager.setURLModifier`. PMX files store
   * textures as relative paths, but the model is loaded from a `blob:` URL
   * whose base cannot resolve those relatives, so we match by basename (and
   * fall back to a normalized full path). Texture basenames are effectively
   * unique within a single model, which makes this reliable in practice.
   */
  urlModifier: UrlModifier
  /** Primary model variant (first discovered). */
  variant: MMDModelVariant
  /** All model files found in the archive. */
  variants: MMDModelVariant[]
}

export type MMDModelFormat = 'pmd' | 'pmx'

export interface MMDModelVariant {
  format: MMDModelFormat
  /** In-archive path of the `.pmx`/`.pmd` file. */
  modelPath: string
  /** Display name derived from the model file's basename. */
  name: string
}

const MODEL_EXTS: Record<string, MMDModelFormat> = { '.pmd': 'pmd', '.pmx': 'pmx' }

/** Detects every PMX/PMD model file inside a zip's entry list. */
export function detectMMDVariants(paths: string[]): MMDModelVariant[] {
  const variants: MMDModelVariant[] = []
  for (const path of paths) {
    const format = modelFormatOf(path)
    if (!format)
      continue
    variants.push({ format, modelPath: path, name: stripExt(basename(path)) })
  }
  return variants
}

/**
 * Loads an MMD model packaged as a ZIP (the common distribution format: a
 * `.pmx`/`.pmd` plus its texture/toon/sphere-map files) into blob URLs ready
 * for {@link createMMDLoaderContext}.
 *
 * Call `dispose()` on unmount or reload to revoke the blob URLs.
 */
export async function loadMMDZip(file: ArrayBuffer | Blob | File): Promise<MMDLoadedAssets> {
  const zip = new JSZip()
  const archive = await zip.loadAsync(file)

  const paths = Object.keys(archive.files).filter(name => !archive.files[name].dir)
  const variants = detectMMDVariants(paths)
  if (variants.length === 0)
    throw new Error('MMD ZIP must contain a .pmx or .pmd model file')

  const blobUrls: Record<string, string> = {}
  await Promise.all(paths.map(async (path) => {
    const entry = archive.files[path]
    if (!entry)
      return
    const blob = await entry.async('blob')
    blobUrls[path] = URL.createObjectURL(blob)
  }))

  const variant = variants[0]
  const modelBlobUrl = blobUrls[variant.modelPath]

  return {
    blobUrls,
    dispose: () => {
      for (const url of Object.values(blobUrls)) {
        if (url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url)
          }
          catch {}
        }
      }
    },
    modelBlobUrl,
    urlModifier: createUrlModifier(blobUrls),
    variant,
    variants,
  }
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  return slash === -1 ? norm : norm.slice(slash + 1)
}

/**
 * Builds a basename-keyed resolver from the archive's blob URLs.
 *
 * PMX texture references can include subdirectories and backslashes; we
 * normalize the requested URL down to its basename and look that up, with a
 * normalized full-path fallback for the rare case of duplicate basenames.
 */
function createUrlModifier(blobUrls: Record<string, string>): UrlModifier {
  const byBasename = new Map<string, string>()
  const byPath = new Map<string, string>()
  for (const [path, url] of Object.entries(blobUrls)) {
    byPath.set(path.replace(/\\/g, '/').toLowerCase(), url)
    byBasename.set(basename(path).toLowerCase(), url)
  }

  return (requested: string) => {
    const clean = requested.split(/[?#]/)[0]
    let decoded = clean
    try {
      decoded = decodeURIComponent(clean)
    }
    catch {}

    const normalizedPath = decoded.replace(/\\/g, '/').toLowerCase()
    for (const [path, url] of byPath) {
      if (normalizedPath.endsWith(path))
        return url
    }

    const base = basename(decoded).toLowerCase()
    return byBasename.get(base) ?? requested
  }
}

function modelFormatOf(path: string): MMDModelFormat | undefined {
  const lower = path.toLowerCase()
  for (const [ext, format] of Object.entries(MODEL_EXTS)) {
    if (lower.endsWith(ext))
      return format
  }
  return undefined
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}
