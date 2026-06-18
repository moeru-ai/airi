import type { JSONObject, ModelSettings } from 'pixi-live2d-display/cubism4'

import JSZip from 'jszip'

import { Cubism4ModelSettings, FileLoader, Live2DFactory, ZipLoader } from 'pixi-live2d-display/cubism4'

ZipLoader.zipReader = (data: Blob, _url: string) => JSZip.loadAsync(data)

interface IgnoredArchivePathSegmentRule {
  matches: (segment: string) => boolean
}

const ignoredArchivePathSegmentRules: IgnoredArchivePathSegmentRule[] = [
  { matches: segment => segment === '__MACOSX' },
  { matches: segment => segment.startsWith('._') },
]

function shouldIgnoreLive2DArchiveEntry(filePath: string): boolean {
  return filePath
    .split('/')
    .some(segment => ignoredArchivePathSegmentRules.some(rule => rule.matches(segment)))
}

ZipLoader.createSettings = async (reader: JSZip) => {
  const filePaths = Object.keys(reader.files)
  const settings = await (async () => {
    const settingsFilePath = filePaths.find(file => isSettingsFile(file))
    if (!settingsFilePath) {
      return createFakeSettings(filePaths)
    }
    return createModelSettings(await ZipLoader.readText(reader, settingsFilePath), settingsFilePath)
  })()

  // Extract CDI data from the zip if available
  try {
    const metadataSettings = settings as ModelSettings & {
      _cdiData?: unknown
      _expFiles?: Array<{ name: string, fileName: string, data: unknown }>
    }

    // Find and parse CDI file
    const cdiPath = filePaths.find(f => f.toLowerCase().endsWith('.cdi3.json'))
    if (cdiPath) {
      const cdiText = await reader.file(cdiPath)!.async('text')
      metadataSettings._cdiData = JSON.parse(cdiText)
      console.info('[ZipLoader] Extracted CDI data from:', cdiPath)
    }

    // Find and collect expression files
    const expPaths = filePaths.filter(f => f.toLowerCase().endsWith('.exp3.json'))
    if (expPaths.length > 0) {
      const expFiles: Array<{ name: string, fileName: string, data: unknown }> = []
      for (const expPath of expPaths) {
        const expText = await reader.file(expPath)!.async('text')
        const baseName = expPath.split('/').pop()?.replace('.exp3.json', '') || expPath
        expFiles.push({
          name: baseName,
          fileName: expPath,
          data: JSON.parse(expText),
        })
      }
      metadataSettings._expFiles = expFiles
      console.info('[ZipLoader] Extracted', expFiles.length, 'expression files')
    }
  }
  catch (e) {
    console.warn('[ZipLoader] Failed to extract CDI/EXP metadata:', e)
  }

  return settings
}

/**
 * Normalizes Live2D model settings JSON before upstream path resolution.
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
    if (fileReferences.Physics === null)
      delete fileReferences.Physics
    if (fileReferences.Pose === null)
      delete fileReferences.Pose
    if (fileReferences.DisplayInfo === null)
      delete fileReferences.DisplayInfo
  }

  return JSON.stringify(json)
}

function createModelSettings(text: string, url: string): ModelSettings {
  if (!text) {
    throw new Error(`Empty settings file: ${url}`)
  }

  const settingsJSON = JSON.parse(text) as JSONObject & { url?: string }
  settingsJSON.url = url
  const runtime = Live2DFactory.findRuntime(settingsJSON)

  if (!runtime) {
    throw new Error('Unknown settings JSON')
  }

  return runtime.createModelSettings(settingsJSON)
}

export function isSettingsFile(file: string) {
  return !shouldIgnoreLive2DArchiveEntry(file)
    && !file.endsWith('items_pinned_to_model.json')
    && (file.endsWith('.model3.json') || file.endsWith('.model.json'))
}

export function isMocFile(file: string) {
  return file.endsWith('.moc3')
}

export function basename(path: string): string {
  // https://stackoverflow.com/a/15270931
  return path.split(/[\\/]/).pop()!
}

// copy and modified from https://github.com/guansss/live2d-viewer-web/blob/f6060b2ce52c2e26b6b61fa903c837fe343f72d1/src/app/upload.ts#L81-L142
function createFakeSettings(files: string[]): ModelSettings {
  const mocFiles = files.filter(file => isMocFile(file))

  if (mocFiles.length !== 1) {
    const fileList = mocFiles.length ? `(${mocFiles.map(f => `"${f}"`).join(',')})` : ''

    throw new Error(`Expected exactly one moc file, got ${mocFiles.length} ${fileList}`)
  }

  const mocFile = mocFiles[0]
  const modelName = basename(mocFile).replace(/\.moc3?/, '')

  const textures = files.filter(f => f.endsWith('.png'))

  if (!textures.length) {
    throw new Error('Textures not found')
  }

  const motions = files.filter(f => f.endsWith('.mtn') || f.endsWith('.motion3.json'))
  const physics = files.find(f => f.includes('physics'))
  const pose = files.find(f => f.includes('pose'))

  const settings = new Cubism4ModelSettings({
    url: `${modelName}.model3.json`,
    Version: 3,
    FileReferences: {
      Moc: mocFile,
      Textures: textures,
      Physics: physics,
      Pose: pose,
      Motions: motions.length
        ? {
            '': motions.map(motion => ({ File: motion })),
          }
        : undefined,
    },
  })

  settings.name = modelName

  // provide this property for FileLoader
  Object.assign(settings, { _objectURL: `example://${settings.url}` })

  return settings
}

ZipLoader.readText = async (jsZip: JSZip, path: string) => {
  const file = jsZip.file(path)

  if (!file) {
    throw new Error(`Cannot find file: ${path}`)
  }

  const text = await file.async('text')

  return isSettingsFile(path) ? sanitizeModelSettingsText(text) : text
}

const defaultFileLoaderReadText = FileLoader.readText
FileLoader.createSettings = async (files: File[]) => {
  const settingsFile = files.find(file => isSettingsFile(file.webkitRelativePath || file.name))

  if (!settingsFile) {
    throw new TypeError('Settings file not found')
  }

  const settingsUrl = settingsFile.webkitRelativePath || settingsFile.name
  const settingsText = await FileLoader.readText(settingsFile)
  const settings = createModelSettings(settingsText, settingsUrl)
  Object.assign(settings, { _objectURL: URL.createObjectURL(settingsFile) })

  return settings
}

FileLoader.readText = async (file: File) => {
  const text = await defaultFileLoaderReadText(file)
  const path = file.webkitRelativePath || file.name

  return isSettingsFile(path) ? sanitizeModelSettingsText(text) : text
}

ZipLoader.getFilePaths = (jsZip: JSZip) => {
  const paths: string[] = []

  jsZip.forEach((relativePath, file) => {
    if (!file.dir && !shouldIgnoreLive2DArchiveEntry(relativePath)) {
      paths.push(relativePath)
    }
  })

  return Promise.resolve(paths)
}

ZipLoader.getFiles = (jsZip: JSZip, paths: string[]) =>
  Promise.all(paths.map(
    async (path) => {
      const fileName = path.slice(path.lastIndexOf('/') + 1)

      const blob = await jsZip.file(path)!.async('blob')

      return new File([blob], fileName)
    },
  ))
