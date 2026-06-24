import JSZip from 'jszip'

export interface SpineModelLayout {
  /**
   * Path of the skeleton file inside the ZIP (`.skel` for binary, `.json` for JSON).
   */
  skeletonPath: string
  skeletonFormat: 'binary' | 'json'

  /** Path of the texture atlas (`.atlas` or `.atlas.txt`). */
  atlasPath: string

  /** All texture page paths referenced by the atlas. */
  texturePaths: string[]
}

export interface SpineModelVariant {
  /** Display name derived from the folder/file name. */
  name: string
  layout: SpineModelLayout
}

export interface SpineLoadedAssets {
  layout: SpineModelLayout

  /** All skeleton+atlas pairs found in the ZIP. */
  variants: SpineModelVariant[]

  /**
   * Blob URLs for texture pages, keyed by ZIP path.
   * Used as `image.src` in the Spine texture loader.
   */
  blobUrls: Record<string, string>

  /**
   * Raw decoded data keyed by ZIP path.
   * Skeleton binary → Uint8Array, skeleton JSON / atlas → string.
   * Fed directly to the Downloader to avoid base64 round-trip corruption.
   */
  rawData: Record<string, Uint8Array | string>

  /** Disposes every blob URL allocated for this load. */
  dispose: () => void
}

const SKELETON_BINARY_EXT = '.skel'
const SKELETON_JSON_EXT = '.json'
const ATLAS_EXT_PRIMARY = '.atlas'
const ATLAS_EXT_TXT = '.atlas.txt'
const TEXTURE_EXTS = ['.png', '.webp', '.jpg', '.jpeg']

function isTexturePath(name: string) {
  const lower = name.toLowerCase()
  return TEXTURE_EXTS.some((ext) => lower.endsWith(ext))
}

function isAtlasPath(name: string) {
  const lower = name.toLowerCase()
  return lower.endsWith(ATLAS_EXT_PRIMARY) || lower.endsWith(ATLAS_EXT_TXT)
}

function isSkeletonBinaryPath(name: string) {
  return name.toLowerCase().endsWith(SKELETON_BINARY_EXT)
}

function isSkeletonJsonPath(name: string) {
  // Filter out package manifests / settings — only treat as a skeleton if it
  // sits next to an atlas with the same base name. The caller validates.
  const lower = name.toLowerCase()
  if (!lower.endsWith(SKELETON_JSON_EXT)) return false
  // Exclude obvious non-skeleton JSON.
  if (lower.endsWith('package.json') || lower.endsWith('manifest.json')) return false

  return true
}

function basename(path: string) {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

function stripExt(name: string) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

function dirname(path: string) {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash + 1)
}

/**
 * Inspect a Spine ZIP and resolve the skeleton, atlas, and texture page
 * paths.
 *
 * Heuristics:
 * 1. Find all `.atlas`/`.atlas.txt` files paired with same-basename skeletons.
 * 2. For each pair, walk the atlas to extract texture page filenames.
 * 3. Return the first matched pair as the primary layout.
 */
export function detectSpineLayout(
  entries: Record<string, string>,
  atlasText: Record<string, string>,
): SpineModelLayout {
  const variants = detectAllSpineLayouts(entries, atlasText)
  if (variants.length === 0)
    throw new Error('Spine ZIP must contain a .skel or .json skeleton file paired with a .atlas')
  return variants[0].layout
}

/**
 * Detects all skeleton+atlas pairs in a ZIP, returning them as named
 * variants. Useful for ZIPs containing multiple outfits/characters in
 * separate folders.
 */
/**
 * First pass: match each atlas with a same-basename skeleton.
 * Returns the matched variants and populates `usedAtlases` with matched atlas paths.
 */
function matchAtlasesByBasename(
  atlasCandidates: string[],
  entries: Record<string, string>,
  usedAtlases: Set<string>,
  atlasText: Record<string, string>,
): SpineModelVariant[] {
  const variants: SpineModelVariant[] = []
  for (const candidate of atlasCandidates) {
    const baseName = stripExt(stripExt(basename(candidate)))
    const dir = dirname(candidate)

    const binaryPath = `${dir}${baseName}${SKELETON_BINARY_EXT}`
    const jsonPath = `${dir}${baseName}${SKELETON_JSON_EXT}`

    let skeletonPath: string | undefined
    let skeletonFormat: SpineModelLayout['skeletonFormat'] = 'binary'

    if (entries[binaryPath] !== undefined) {
      skeletonPath = binaryPath
      skeletonFormat = 'binary'
    } else if (entries[jsonPath] !== undefined) {
      skeletonPath = jsonPath
      skeletonFormat = 'json'
    }

    if (!skeletonPath) continue

    usedAtlases.add(candidate)
    const texturePaths = resolveAtlasTextures(candidate, entries, atlasText)
    const name = dir ? dir.replace(/\/$/, '').split('/').pop()! : baseName
    variants.push({ name, layout: { skeletonPath, skeletonFormat, atlasPath: candidate, texturePaths } })
  }
  return variants
}

/**
 * Fallback pass: pair unmatched atlases with any skeleton in the same directory.
 */
function matchAtlasesByDirectory(
  atlasCandidates: string[],
  allFiles: string[],
  usedAtlases: Set<string>,
  entries: Record<string, string>,
  atlasText: Record<string, string>,
): SpineModelVariant[] {
  const variants: SpineModelVariant[] = []
  for (const candidate of atlasCandidates) {
    if (usedAtlases.has(candidate)) continue

    const dir = dirname(candidate)
    const skel =
      allFiles.find((f) => f.startsWith(dir) && isSkeletonBinaryPath(f)) ??
      allFiles.find((f) => f.startsWith(dir) && isSkeletonJsonPath(f))
    if (!skel) continue

    const skeletonFormat: SpineModelLayout['skeletonFormat'] = isSkeletonBinaryPath(skel) ? 'binary' : 'json'
    const texturePaths = resolveAtlasTextures(candidate, entries, atlasText)
    const baseName = stripExt(stripExt(basename(candidate)))
    const name = dir ? dir.replace(/\/$/, '').split('/').pop()! : baseName
    variants.push({ name, layout: { skeletonPath: skel, skeletonFormat, atlasPath: candidate, texturePaths } })
  }
  return variants
}

export function detectAllSpineLayouts(
  entries: Record<string, string>,
  atlasText: Record<string, string>,
): SpineModelVariant[] {
  const allFiles = Object.keys(entries)
  const atlasCandidates = allFiles.filter(isAtlasPath)
  if (atlasCandidates.length === 0) throw new Error('Spine ZIP must contain a .atlas (or .atlas.txt) file')

  const usedAtlases = new Set<string>()

  const primaryVariants = matchAtlasesByBasename(atlasCandidates, entries, usedAtlases, atlasText)
  const fallbackVariants = matchAtlasesByDirectory(atlasCandidates, allFiles, usedAtlases, entries, atlasText)

  return [...primaryVariants, ...fallbackVariants]
}

/**
 * Heuristic line-by-line atlas parser: walks the atlas text and returns
 * texture page paths that exist in the ZIP entries.
 *
 * Page lines start at column 0 with the texture file name. Continued
 * page-property lines start with whitespace; a blank line ends the page
 * block, and a new page starts with a non-empty, non-indented line that
 * does not contain ':' (atlas property).
 */
function parseAtlasPageLines(lines: string[], atlasPath: string, entries: Record<string, string>): string[] {
  const texturePaths: string[] = []
  const dir = dirname(atlasPath)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (line.trim().length === 0) continue
    if (line[0] === ' ' || line[0] === '\t') continue
    if (line.includes(':')) continue

    // Candidate page name; verify against entries (handles relative path).
    const candidate = `${dir}${line.trim()}`
    if (entries[candidate] !== undefined && isTexturePath(candidate)) texturePaths.push(candidate)

    // Skip property lines until next blank line.
    while (i + 1 < lines.length && lines[i + 1].length > 0) i++
  }
  return texturePaths
}

function resolveAtlasTextures(
  atlasPath: string,
  entries: Record<string, string>,
  atlasText: Record<string, string>,
): string[] {
  const allFiles = Object.keys(entries)

  const text = atlasText[atlasPath] ?? ''
  const lines = text.split(/\r?\n/)
  const texturePaths = parseAtlasPageLines(lines, atlasPath, entries)

  // Fallback: if atlas parsing missed pages, accept every PNG sibling.
  if (texturePaths.length === 0) {
    const dir = dirname(atlasPath)
    for (const file of allFiles) {
      if (file.startsWith(dir) && isTexturePath(file)) texturePaths.push(file)
    }
  }

  return texturePaths
}

/**
 * Pass 1: inventory file paths and read atlas text bodies.
 */
async function inventoryArchive(archive: JSZip): Promise<{
  entries: Record<string, string>
  atlasTexts: Record<string, string>
}> {
  const entries: Record<string, string> = {}
  const atlasTexts: Record<string, string> = {}

  await Promise.all(
    Object.keys(archive.files).map(async (name) => {
      const entry = archive.files[name]
      if (entry.dir) return

      entries[name] = name

      if (isAtlasPath(name)) atlasTexts[name] = await entry.async('string')
    }),
  )

  return { entries, atlasTexts }
}

/**
 * Create blob URLs for all texture pages.
 */
async function materializeTextures(archive: JSZip, paths: Set<string>): Promise<Record<string, string>> {
  const blobUrls: Record<string, string> = {}

  await Promise.all(
    Array.from(paths).map(async (path) => {
      const entry = archive.files[path]
      if (!entry) return
      const buffer = await entry.async('blob')
      blobUrls[path] = URL.createObjectURL(buffer)
    }),
  )

  return blobUrls
}

/**
 * Decode skeleton data (binary → Uint8Array, JSON → string).
 *
 * NOTICE:
 * Spine's BinaryInput does `new DataView(data.buffer)` without respecting
 * byteOffset. JSZip may return a Uint8Array that is a view into a larger
 * ArrayBuffer. We copy via `.slice(0)` which produces a zero-offset buffer.
 * Source: spine-core/SkeletonBinary.js BinaryInput constructor.
 * Removal condition: Spine fixes BinaryInput to use byteOffset/byteLength.
 */
async function materializeSkeletons(
  archive: JSZip,
  paths: Set<string>,
  variants: SpineModelVariant[],
): Promise<Record<string, Uint8Array | string>> {
  const rawData: Record<string, Uint8Array | string> = {}

  await Promise.all(
    Array.from(paths).map(async (path) => {
      const entry = archive.files[path]
      if (!entry) return
      const variant = variants.find((v) => v.layout.skeletonPath === path)!
      if (variant.layout.skeletonFormat === 'binary') {
        const ab = await entry.async('arraybuffer')
        rawData[path] = new Uint8Array(ab.slice(0))
      } else {
        rawData[path] = await entry.async('string')
      }
    }),
  )

  return rawData
}

/**
 * Rewrite atlas page references to bare filenames for Spine's AssetManager.
 */
function materializeAtlases(
  atlasPaths: Set<string>,
  variants: SpineModelVariant[],
  atlasTexts: Record<string, string>,
  blobUrls: Record<string, string>,
): Record<string, string> {
  const rawData: Record<string, string> = {}

  for (const atlasPath of atlasPaths) {
    const variantForAtlas = variants.find((v) => v.layout.atlasPath === atlasPath)!
    const finalAtlasText = rewriteAtlasPageReferences(atlasTexts[atlasPath] ?? '', variantForAtlas.layout, blobUrls)
    rawData[atlasPath] = finalAtlasText
  }

  return rawData
}

/**
 * Loads a Spine model packaged as a ZIP into a set of blob URLs ready for
 * `spine.AssetManager`.
 *
 * The returned `dispose()` revokes every blob URL — call it on unmount or
 * when reloading.
 */
export async function loadSpineZip(file: File | Blob | ArrayBuffer): Promise<SpineLoadedAssets> {
  const zip = new JSZip()
  const archive = await zip.loadAsync(file)

  // Pass 1: inventory file paths and read atlas text bodies.
  const { entries, atlasTexts } = await inventoryArchive(archive)

  const variants = detectAllSpineLayouts(entries, atlasTexts)
  if (variants.length === 0) throw new Error('Spine ZIP must contain at least one skeleton+atlas pair')
  const layout = variants[0].layout

  // Collect all unique paths across all variants.
  const allTexturePaths = new Set<string>()
  const allSkeletonPaths = new Set<string>()
  const allAtlasPaths = new Set<string>()
  for (const v of variants) {
    allSkeletonPaths.add(v.layout.skeletonPath)
    allAtlasPaths.add(v.layout.atlasPath)
    for (const t of v.layout.texturePaths) allTexturePaths.add(t)
  }

  // Pass 2: materialize textures → blob URLs (used by image.src in loadTexture).
  // NOTICE:
  // Spine's Downloader has a heuristic for rawDataUris: if the value doesn't
  // contain ".", it treats it as a data: URI and calls atob(). In Electron,
  // blob URLs are `blob:null/<uuid>` (no dots), so the Downloader fails.
  // Even with data: URIs, Spine's atob-based decode can corrupt binary data.
  // We store raw decoded data (Uint8Array / string) alongside blob URLs and
  // monkey-patch the Downloader's download methods to serve from memory.
  // Removal condition: Spine ships a Blob-aware or buffer-aware loader.
  const blobUrls = await materializeTextures(archive, allTexturePaths)

  // Pass 3: materialize skeletons → raw decoded data
  const rawData = await materializeSkeletons(archive, allSkeletonPaths, variants)

  // Pass 4: materialize atlases → raw text with page references rewritten
  Object.assign(rawData, materializeAtlases(allAtlasPaths, variants, atlasTexts, blobUrls))

  return {
    layout,
    variants,
    blobUrls,
    rawData,
    dispose: () => {
      for (const url of Object.values(blobUrls)) {
        if (url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url)
            // eslint-disable-next-line no-empty
          } catch {
            // noop
          }
        }
      }
    },
  }
}

/**
 * Returns true if the line is a blank, indented, or property line that
 * should be passed through unchanged during atlas reference rewriting.
 */
function isPassthroughLine(line: string): boolean {
  return line.trim().length === 0 || line[0] === ' ' || line[0] === '\t' || line.includes(':')
}

function rewriteAtlasPageReferences(atlasText: string, layout: SpineModelLayout, blobUrls: Record<string, string>) {
  const dir = dirname(layout.atlasPath)
  // eslint-disable-next-line no-restricted-syntax
  const lines = atlasText.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (isPassthroughLine(line)) {
      out.push(line)
      continue
    }

    const candidate = `${dir}${line.trim()}`
    if (blobUrls[candidate] && layout.texturePaths.includes(candidate)) {
      // Spine's atlas reader resolves page paths through the AssetManager's
      // path prefix. We cannot inject `blob:` here directly because the
      // reader joins the prefix with the page name. Instead, leave the
      // bare filename and let the AssetManager resolver handle the lookup.
      out.push(basename(candidate))
    } else {
      out.push(line)
    }
  }

  return out.join('\n')
}
