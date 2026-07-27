import JSZip from 'jszip'

import { decodeZipFileName } from './decode-zip-filename'

// pixi-live2d-display resolves model files through two paths that disagree about
// URI encoding:
//
//   FileLoader.factory   settings.validateFiles(files.map(f => encodeURI(f.webkitRelativePath)))
//   ModelSettings        resolveURL(path) { return url.resolve(this.url, path) }   // never encoded
//
// validateFiles then does `files.includes(resolveURL(ref))`, comparing an encoded
// list against an unencoded lookup. ASCII paths survive because encodeURI is a
// no-op on them, so every bundled model works and the bug stays invisible — but a
// CJK-named archive percent-encodes on one side only and can never match, failing
// with "File "<name>.moc3" is defined in settings, but doesn't exist in given
// files" even though the entry is present.
//
// Rewriting the archive to ASCII sidesteps the mismatch without forking the
// resolver, and simultaneously repairs two other archive shapes the loader
// mishandles: basename collisions (its file map is keyed by basename, so
// same-named entries in different folders overwrite each other) and macOS
// resource-fork junk.
//
// Removal condition: pixi-live2d-display compares both sides in the same encoding
// — track https://github.com/guansss/pixi-live2d-display via the repo's existing
// patches/pixi-live2d-display.patch, which is where a fix would land first.

/** Live2D settings files use multi-part extensions; a last-dot split mangles them. */
const COMPOUND_EXTENSIONS = [
  '.model3.json',
  '.physics3.json',
  '.cdi3.json',
  '.exp3.json',
  '.motion3.json',
  '.pose3.json',
  '.userdata3.json',
]

const IGNORED_SEGMENTS = [
  (segment: string) => segment === '__MACOSX',
  (segment: string) => segment.startsWith('._'),
]

function shouldIgnore(path: string): boolean {
  return path.split('/').some(segment => IGNORED_SEGMENTS.some(rule => rule(segment)))
}

function splitExtension(name: string): [string, string] {
  const lower = name.toLowerCase()
  const compound = COMPOUND_EXTENSIONS.find(extension => lower.endsWith(extension))
  if (compound)
    return [name.slice(0, -compound.length), name.slice(-compound.length)]

  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
}

/**
 * Reduces one path segment to ASCII, keeping any ASCII run already present.
 *
 * Before:
 * - `八千代辉夜姬.moc3`
 * - `泪珠.exp3.json`
 *
 * After:
 * - `<fallback>.moc3`
 * - `<fallback>.exp3.json`
 *
 * The stem and extension are slugged separately: collapsing `泪珠.exp3.json`
 * wholesale would yield a bare `.exp3.json`, which every other expression in the
 * archive would also produce — silently overwriting all but the last.
 */
function toAsciiSegment(segment: string, fallback: string): string {
  const [stem, extension] = splitExtension(segment)
  const ascii = stem.replace(/[^\w-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return (ascii || fallback) + extension
}

function isAsciiPath(path: string): boolean {
  return !/[^\x20-\x7E]/.test(path)
}

function buildAsciiPathMap(paths: string[]): Map<string, string> {
  const mapping = new Map<string, string>()
  // Directory renames are cached by their original prefix. A directory whose name
  // is entirely non-ASCII has to resolve to the *same* substitute every time it is
  // encountered, otherwise each file lands in its own invented folder and the
  // settings file can no longer reach its own moc and textures.
  const directoryNames = new Map<string, string>()
  const taken = new Set<string>()

  for (const path of paths) {
    const segments = path.split('/')
    const asciiSegments: string[] = []
    let prefix = ''

    segments.forEach((segment, index) => {
      prefix = prefix ? `${prefix}/${segment}` : segment

      if (index === segments.length - 1) {
        // Name a nameless file after its folder, so a model whose every path is
        // non-ASCII still comes out as `model/model.moc3` rather than `model/file0`.
        const parent = asciiSegments.at(-1) ?? 'model'
        asciiSegments.push(toAsciiSegment(segment, parent))
        return
      }

      let renamed = directoryNames.get(prefix)
      if (!renamed) {
        renamed = toAsciiSegment(segment, directoryNames.size ? `model-${directoryNames.size + 1}` : 'model')
        directoryNames.set(prefix, renamed)
      }
      asciiSegments.push(renamed)
    })

    let candidate = asciiSegments.join('/')
    if (taken.has(candidate)) {
      const [stem, extension] = splitExtension(candidate)
      let suffix = 2
      while (taken.has(`${stem}-${suffix}${extension}`))
        suffix += 1
      candidate = `${stem}-${suffix}${extension}`
    }

    taken.add(candidate)
    mapping.set(path, candidate)
  }

  return mapping
}

/**
 * Rewrites `model3.json` file references so they still resolve after renaming.
 *
 * References are relative to the settings file, so each is resolved against the
 * settings directory, looked up in the rename map, and re-expressed relative to
 * the settings file's new location.
 */
function remapSettings(text: string, settingsPath: string, mapping: Map<string, string>): string {
  const json = JSON.parse(text) as Record<string, unknown>
  const references = json.FileReferences
  if (!references || typeof references !== 'object')
    return JSON.stringify(json, null, 2)

  const settingsDirectory = settingsPath.includes('/') ? `${settingsPath.replace(/\/[^/]*$/, '')}/` : ''
  const newSettingsDirectory = (mapping.get(settingsPath) ?? settingsPath).replace(/\/[^/]*$/, '')

  const remap = (reference: string): string => {
    const resolved = `${settingsDirectory}${reference}`.split('/').reduce<string[]>((stack, part) => {
      if (part === '.' || part === '')
        return stack
      if (part === '..')
        stack.pop()
      else stack.push(part)
      return stack
    }, []).join('/')

    const renamed = mapping.get(resolved)
    if (!renamed)
      return reference

    return newSettingsDirectory && renamed.startsWith(`${newSettingsDirectory}/`)
      ? renamed.slice(newSettingsDirectory.length + 1)
      : renamed
  }

  const fileReferences = references as Record<string, unknown>
  for (const key of ['Moc', 'Physics', 'Pose', 'DisplayInfo'] as const) {
    if (typeof fileReferences[key] === 'string')
      fileReferences[key] = remap(fileReferences[key])
  }
  if (Array.isArray(fileReferences.Textures))
    fileReferences.Textures = fileReferences.Textures.map(texture => typeof texture === 'string' ? remap(texture) : texture)

  return JSON.stringify(json, null, 2)
}

/**
 * Returns an archive whose entry paths are guaranteed ASCII, so the Live2D
 * loader's encoded/unencoded path comparison can match.
 *
 * Archives that are already ASCII are returned untouched — repacking a model is
 * expensive (textures routinely run tens of megabytes) and pointless when the
 * loader would have accepted the original.
 */
export async function normalizeLive2DZip(file: File): Promise<File> {
  // Read the bytes ourselves rather than handing JSZip the File: its Blob path
  // depends on FileReader, which does not exist outside the browser and would
  // make this unusable from tests and any non-DOM runtime.
  const reader = await JSZip.loadAsync(await file.arrayBuffer(), { decodeFileName: decodeZipFileName })
  const paths = Object.keys(reader.files).filter(path => !reader.files[path].dir && !shouldIgnore(path))

  if (paths.every(isAsciiPath))
    return file

  const mapping = buildAsciiPathMap(paths)
  const settingsPath = paths.find(path => path.endsWith('.model3.json') || path.endsWith('.model.json'))
  const output = new JSZip()

  for (const path of paths) {
    const target = mapping.get(path)!
    if (path === settingsPath) {
      const text = await reader.file(path)!.async('string')
      output.file(target, remapSettings(text, path, mapping))
      continue
    }

    output.file(target, await reader.file(path)!.async('uint8array'))
  }

  const bytes = await output.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  console.info('[Live2D] Archive contained non-ASCII paths; normalized', paths.length, 'entries for the loader')

  return new File([bytes], file.name, { type: file.type })
}
