import type { JSONObject, ModelSettings } from 'pixi-live2d-display'

import type { Live2DRuntime } from './live2d-runtime'

import JSZip from 'jszip'

import { decodeZipFileName } from './decode-zip-filename'
import { isCubism2RuntimeConfigured } from './live2d-runtime'

let configuredRuntime: Live2DRuntime | undefined

function shouldIgnoreLive2DArchiveEntry(filePath: string): boolean {
  return filePath
    .split('/')
    .some(segment => segment === '__MACOSX' || segment.startsWith('._'))
}

export function isSettingsFile(file: string): boolean {
  return !shouldIgnoreLive2DArchiveEntry(file)
    && !file.endsWith('items_pinned_to_model.json')
    && (file.endsWith('.model3.json') || file.endsWith('model.json'))
}

export function isMocFile(file: string): boolean {
  return file.endsWith('.moc3') || file.endsWith('.moc')
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop()!
}

/**
 * Normalizes nullable Cubism 3+ references before upstream path resolution.
 *
 * Before:
 * - `{ "FileReferences": { "Physics": null } }`
 *
 * After:
 * - `{ "FileReferences": {} }`
 */
function sanitizeModelSettingsText(text: string): string {
  const json = JSON.parse(text) as Record<string, unknown>
  const refs = json.FileReferences

  if (refs && typeof refs === 'object') {
    const fileReferences = refs as Record<string, unknown>
    for (const key of ['Physics', 'Pose', 'DisplayInfo']) {
      if (fileReferences[key] === null)
        delete fileReferences[key]
    }
  }

  return JSON.stringify(json)
}

/**
 * Mirrors upstream `Cubism2ModelSettings.isValidJSON`, the predicate
 * `Live2DFactory.findRuntime` uses to claim a settings file for Cubism 2.
 *
 * Reimplemented here because the Cubism 2 runtime class only exists in the
 * combined bundle, which cannot be imported in a build without the legacy core.
 * Source: `node_modules/pixi-live2d-display/dist/index.es.js:1916-1919`.
 */
function isCubism2SettingsJSON(json: JSONObject): boolean {
  const candidate = json as { model?: unknown, textures?: unknown }
  return typeof candidate.model === 'string'
    && Array.isArray(candidate.textures)
    && candidate.textures.length > 0
    && candidate.textures.every(texture => typeof texture === 'string')
}

/**
 * Explains how to supply the Cubism 2 core, matching the provisioning story in
 * this package's README and the Vite plugin's two input paths.
 */
function cubism2CoreMissingMessage(url: string): string {
  return `Cubism 2 model "${url}" needs the proprietary live2d.min.js core, which is not present in this build. `
    + `Drop the core at packages/stage-ui-live2d/.cubism2/live2d.min.js for development, `
    + `or set AIRI_CUBISM2_CORE_PATH and AIRI_CUBISM2_CORE_SHA256 for a release build.`
}

function createModelSettings(text: string, url: string): ModelSettings {
  if (!configuredRuntime)
    throw new Error('Live2D runtime has not been configured.')
  if (!text)
    throw new Error(`Empty settings file: ${url}`)

  const settingsJSON = JSON.parse(text) as JSONObject & { url?: string }
  settingsJSON.url = url
  const runtime = configuredRuntime.Live2DFactory.findRuntime(settingsJSON)
  if (!runtime) {
    // A Cubism 2 model in a Cubism 3+-only build reaches here looking exactly
    // like corrupt JSON, so classify it before falling back to the generic
    // message; the build gate is the only difference between the two cases.
    if (isCubism2SettingsJSON(settingsJSON) && !isCubism2RuntimeConfigured())
      throw new Error(cubism2CoreMissingMessage(url))

    throw new Error('Unknown Live2D settings JSON.')
  }

  return runtime.createModelSettings(settingsJSON)
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
  /** Every `.exp.json` / `.exp3.json` in the model, each named by its extension-stripped basename. */
  _expFiles?: Array<{ name: string, fileName: string, data: unknown }>
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

async function collectArchiveMetadata(reader: JSZip, settings: ModelSettings, filePaths: string[]) {
  const metadataSettings = settings as ModelSettings & Live2DModelMetadata

  // The caller passes raw ZIP entries, which still include macOS AppleDouble
  // sidecars. Those carry binary payloads under a JSON-looking name, so parsing
  // one throws; OPFS strips them before the File[] path ever sees them.
  const modelPaths = filePaths.filter(path => !shouldIgnoreLive2DArchiveEntry(path))

  const cdiPath = modelPaths.find(isCdiPath)
  if (cdiPath)
    metadataSettings._cdiData = JSON.parse(await reader.file(cdiPath)!.async('text'))

  metadataSettings._expFiles = await Promise.all(modelPaths.filter(isExpressionPath).map(async fileName => ({
    name: expressionNameOf(fileName),
    fileName,
    data: JSON.parse(await reader.file(fileName)!.async('text')),
  })))
}

/**
 * `collectArchiveMetadata` for the OPFS-restored `File[]` path, where entries
 * are read through the File API instead of JSZip.
 */
async function collectDirectoryMetadata(files: File[], settings: ModelSettings) {
  const metadataSettings = settings as ModelSettings & Live2DModelMetadata
  const pathOf = (file: File) => file.webkitRelativePath || file.name

  const cdiFile = files.find(file => isCdiPath(pathOf(file)))
  if (cdiFile)
    metadataSettings._cdiData = JSON.parse(await cdiFile.text())

  metadataSettings._expFiles = await Promise.all(
    files.filter(file => isExpressionPath(pathOf(file))).map(async file => ({
      name: expressionNameOf(pathOf(file)),
      fileName: pathOf(file),
      data: JSON.parse(await file.text()),
    })),
  )
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
    const settingsPath = filePaths.find(isSettingsFile)
    if (!settingsPath)
      throw new Error('A Live2D .model.json or .model3.json entry point is required.')

    const settings = createModelSettings(
      sanitizeModelSettingsText(await reader.file(settingsPath)!.async('text')),
      settingsPath,
    )
    await collectArchiveMetadata(reader, settings, filePaths)
    return settings
  }

  ZipLoader.readText = async (reader: JSZip, path: string) => {
    const file = reader.file(path)
    if (!file)
      throw new Error(`Cannot find file: ${path}`)
    const text = await file.async('text')
    return isSettingsFile(path) ? sanitizeModelSettingsText(text) : text
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
    const settingsFile = files.find(file => isSettingsFile(file.webkitRelativePath || file.name))
    if (!settingsFile)
      throw new TypeError('A Live2D .model.json or .model3.json entry point is required.')
    const settingsUrl = settingsFile.webkitRelativePath || settingsFile.name
    const settings = createModelSettings(await FileLoader.readText(settingsFile), settingsUrl)
    Object.assign(settings, { _objectURL: URL.createObjectURL(settingsFile) })
    await collectDirectoryMetadata(files, settings)
    return settings
  }
  FileLoader.readText = async (file: File) => {
    const text = await defaultReadText(file)
    return isSettingsFile(file.webkitRelativePath || file.name)
      ? sanitizeModelSettingsText(text)
      : text
  }
}
