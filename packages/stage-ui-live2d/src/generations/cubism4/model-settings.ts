import type { ModelSettings } from 'pixi-live2d-display'

import type { Live2DRuntime } from '../../utils/live2d-runtime'

import { cubism4Loader } from './loader'
import { isCubism4MocFile, isCubism4MotionFile, isCubism4TextureFile } from './loose-files'

export function isCubism4SettingsFile(file: string): boolean {
  return file.endsWith('.model3.json')
}

export function basename(path: string): string {
  // https://stackoverflow.com/a/15270931
  return path.split(/[\\/]/).pop()!
}

/** Removes nullable optional Cubism 4 references before upstream path resolution. */
export function sanitizeCubism4ModelSettingsText(text: string): string {
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

/**
 * Builds settings for loose Cubism 4 files using the selected runtime's classes.
 * Based on https://github.com/guansss/live2d-viewer-web/blob/f6060b2ce52c2e26b6b61fa903c837fe343f72d1/src/app/upload.ts#L81-L142.
 */
export function createCubism4FakeSettings(runtime: Live2DRuntime, files: string[]): ModelSettings {
  const mocFiles = files.filter(file => isCubism4MocFile(file))

  if (mocFiles.length !== 1) {
    const fileList = mocFiles.length ? `(${mocFiles.map(f => `"${f}"`).join(',')})` : ''

    throw new Error(`Expected exactly one moc file, got ${mocFiles.length} ${fileList}`)
  }

  const mocFile = mocFiles[0]
  const modelName = basename(mocFile).replace(/\.moc3?/i, '')
  const textures = files.filter(file => isCubism4TextureFile(file))

  if (!textures.length)
    throw new Error('Textures not found')

  const motions = files.filter(file => isCubism4MotionFile(file))
  const physics = files.find(f => f.includes('physics'))
  const pose = files.find(f => f.includes('pose'))
  const settings = cubism4Loader.createSettings(runtime, {
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
  }, `${modelName}.model3.json`)

  settings.name = modelName
  Object.assign(settings, { _objectURL: `example://${settings.url}` })
  return settings
}
