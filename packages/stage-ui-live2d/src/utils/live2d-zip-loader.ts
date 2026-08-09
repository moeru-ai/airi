import type { JSONObject, ModelSettings } from 'pixi-live2d-display'

import type { Live2DRuntime } from './live2d-runtime'

import JSZip from 'jszip'

import { errorMessageFrom } from '@moeru/std'

import { createCubism4FakeSettings } from '../generations/cubism4/model-settings'
import { isLive2DSettingsFile, selectLive2DSettings, shouldIgnoreLive2DArchiveEntry } from '../generations/loader'
import { decodeZipFileName } from './decode-zip-filename'

let configuredRuntime: Live2DRuntime | undefined

export function isMocFile(file: string): boolean {
  return file.endsWith('.moc3') || file.endsWith('.moc')
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop()!
}

function createModelSettings(json: JSONObject, url: string): ModelSettings {
  if (!configuredRuntime)
    throw new Error('Live2D runtime has not been configured.')
  const selected = selectLive2DSettings([{ path: url, json }])
  const settings = selected.loader.createSettings(configuredRuntime, selected.loader.sanitizeSettings(json), url)
  const resolveURL = settings.resolveURL.bind(settings)
  settings.resolveURL = (path) => {
    try {
      return decodeURI(resolveURL(path))
    }
    catch {
      return resolveURL(path)
    }
  }
  return settings
}

async function selectZipSettings(reader: JSZip) {
  const paths = Object.keys(reader.files).filter(isLive2DSettingsFile)
  const candidates = await Promise.all(paths.map(async path => ({
    path,
    json: JSON.parse(await reader.file(path)!.async('text')) as JSONObject,
  })))
  return candidates.length ? selectLive2DSettings(candidates) : undefined
}

async function selectFileSettings(files: File[]) {
  const candidates = await Promise.all(files
    .filter(file => isLive2DSettingsFile(file.webkitRelativePath || file.name))
    .map(async file => ({
      path: file.webkitRelativePath || file.name,
      json: JSON.parse(await file.text()) as JSONObject,
      file,
    })))
  if (!candidates.length)
    return undefined
  const selected = selectLive2DSettings(candidates)
  return { ...selected, file: candidates.find(candidate => candidate.path === selected.path)!.file }
}

/**
 * Model metadata AIRI attaches to upstream `ModelSettings`.
 *
 * Both loader paths must produce this identical shape: consumers snapshot
 * expression parameter defaults from `_expFiles` at load time, and the second
 * and every later load of a model is served from the OPFS cache through
 * `FileLoader`, never `ZipLoader`.
 */
interface Live2DModelMetadata {
  /** Parsed `.cdi3.json`, absent for Cubism 2 archives and Cubism 3+ archives that ship none. */
  _cdiData?: unknown
  /**
   * Every readable `.exp.json` / `.exp3.json` in the model, each named by its
   * extension-stripped basename. Files that fail to parse are left out rather
   * than failing the load; see {@link collectMetadata}.
   */
  _expFiles?: Array<{ name: string, fileName: string, data: unknown }>
}

/**
 * One metadata candidate, decoupled from the loader that produced it: `ZipLoader`
 * reads through JSZip while `FileLoader` reads OPFS-restored `File`s.
 */
interface MetadataSource {
  path: string
  readText: () => Promise<string>
}

function isExpressionPath(path: string): boolean {
  const lowerCased = path.toLowerCase()
  return lowerCased.endsWith('.exp3.json') || lowerCased.endsWith('.exp.json')
}

function isCdiPath(path: string): boolean {
  return path.toLowerCase().endsWith('.cdi3.json')
}

function expressionNameOf(path: string): string {
  return basename(path).replace(/\.exp3?\.json$/i, '')
}

/**
 * Reads one metadata payload, reporting an unparseable file as "no metadata
 * here" instead of throwing.
 *
 * Returns a wrapper rather than the value itself so a legitimately parsed
 * `null` stays distinguishable from a failed read.
 */
async function readOptionalJSON(source: MetadataSource): Promise<{ data: unknown } | undefined> {
  try {
    return { data: JSON.parse(await source.readText()) }
  }
  catch (error) {
    console.warn(`[Live2D] Ignoring unreadable metadata file "${source.path}":`, errorMessageFrom(error))
    return undefined
  }
}

/**
 * Collects the optional `.cdi3.json` and expression payloads AIRI attaches to
 * `ModelSettings`, for whichever loader supplied the sources.
 *
 * Parse failures are per-file and non-fatal. This metadata decorates a model
 * that its settings file and render assets already describe completely, and the
 * expression initializer skips individual expressions it cannot use, so letting
 * one malformed or stray sidecar reject `createSettings` would turn an optional
 * problem into a failed import of the entire model.
 */
async function collectMetadata(sources: MetadataSource[]): Promise<Live2DModelMetadata> {
  const metadata: Live2DModelMetadata = {}

  const cdiSource = sources.find(source => isCdiPath(source.path))
  if (cdiSource) {
    const parsed = await readOptionalJSON(cdiSource)
    if (parsed)
      metadata._cdiData = parsed.data
  }

  const expressions = await Promise.all(
    sources.filter(source => isExpressionPath(source.path)).map(async (source) => {
      const parsed = await readOptionalJSON(source)
      return parsed && { name: expressionNameOf(source.path), fileName: source.path, data: parsed.data }
    }),
  )
  metadata._expFiles = expressions.filter(expression => expression != null)

  return metadata
}

/**
 * Installs AIRI's ZIP and directory policies on the selected runtime exactly once.
 */
export function configureLive2DLoaders(runtime: Live2DRuntime): void {
  if (configuredRuntime === runtime)
    return
  configuredRuntime = runtime

  const { FileLoader, ZipLoader } = runtime
  ZipLoader.zipReader = (data: Blob) => JSZip.loadAsync(data, { decodeFileName: decodeZipFileName })

  ZipLoader.createSettings = async (reader: JSZip) => {
    const filePaths = Object.keys(reader.files)
    const selected = await selectZipSettings(reader)
    const settings = selected
      ? createModelSettings(selected.json, selected.path)
      : createCubism4FakeSettings(filePaths)
    // Raw ZIP entries still include macOS AppleDouble sidecars, which carry a
    // binary payload under a JSON-looking name. OPFS strips them before the
    // File[] path below ever sees one.
    Object.assign(settings, await collectMetadata(
      filePaths
        .filter(path => !shouldIgnoreLive2DArchiveEntry(path))
        .map(path => ({ path, readText: () => reader.file(path)!.async('text') })),
    ))

    return settings
  }

  ZipLoader.readText = async (reader: JSZip, path: string) => {
    const file = reader.file(path)
    if (!file)
      throw new Error(`Cannot find file: ${path}`)
    const text = await file.async('text')
    if (!isLive2DSettingsFile(path))
      return text
    const json = JSON.parse(text) as JSONObject
    const selected = selectLive2DSettings([{ path, json }])
    return JSON.stringify(selected.loader.sanitizeSettings(json))
  }

  ZipLoader.getFilePaths = async (reader: JSZip) => {
    const paths: string[] = []
    reader.forEach((relativePath, file) => {
      if (!file.dir && !shouldIgnoreLive2DArchiveEntry(relativePath))
        paths.push(relativePath)
    })
    return paths
  }

  ZipLoader.getFiles = (reader: JSZip, paths: string[]) =>
    Promise.all(paths.map(async (path) => {
      const file = new File([await reader.file(path)!.async('blob')], basename(path))
      Object.defineProperty(file, 'webkitRelativePath', { value: path })
      return file
    }))

  const defaultReadText = FileLoader.readText
  FileLoader.createSettings = async (files: File[]) => {
    const selected = await selectFileSettings(files)
    const settings = selected
      ? createModelSettings(selected.json, selected.path)
      : createCubism4FakeSettings(files.map(file => file.webkitRelativePath || file.name))
    if (selected)
      Object.assign(settings, { _objectURL: URL.createObjectURL(selected.file) })
    Object.assign(settings, await collectMetadata(
      files.map(file => ({ path: file.webkitRelativePath || file.name, readText: () => file.text() })),
    ))

    return settings
  }
  FileLoader.readText = async (file: File) => {
    const text = await defaultReadText(file)
    const path = file.webkitRelativePath || file.name
    if (!isLive2DSettingsFile(path))
      return text
    const json = JSON.parse(text) as JSONObject
    const selected = selectLive2DSettings([{ path, json }])
    return JSON.stringify(selected.loader.sanitizeSettings(json))
  }
}
