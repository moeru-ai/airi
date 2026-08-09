import type { JSONObject } from 'pixi-live2d-display'

import type { Live2DGenerationLoader } from '../loader'

import { prepareCubism4Model } from './model'

function references(json: JSONObject) {
  const result: ReturnType<Live2DGenerationLoader['assetReferences']> = []
  const refs = (json as Record<string, unknown>).FileReferences
  if (!refs || typeof refs !== 'object')
    return result
  const fileReferences = refs as Record<string, unknown>
  for (const [key, kind] of [['Moc', 'MOC'], ['Physics', 'Physics'], ['Pose', 'Pose'], ['DisplayInfo', 'DisplayInfo']] as const) {
    if (typeof fileReferences[key] === 'string')
      result.push({ path: fileReferences[key], kind })
  }
  if (Array.isArray(fileReferences.Textures))
    fileReferences.Textures.forEach(path => typeof path === 'string' && result.push({ path, kind: 'Texture' }))
  for (const [key, kind] of [['Expressions', 'Expression'], ['Motions', 'Motion']] as const) {
    const groups = fileReferences[key]
    const definitions = Array.isArray(groups) ? groups : groups && typeof groups === 'object' ? Object.values(groups).flat() : []
    definitions.forEach((definition) => {
      if (definition && typeof definition === 'object' && 'File' in definition && typeof definition.File === 'string')
        result.push({ path: definition.File, kind })
    })
  }
  return result
}

export const cubism4Loader: Live2DGenerationLoader = {
  generation: 'cubism4',
  isSettingsPath: path => path.toLowerCase().endsWith('.model3.json'),
  isSettingsJSON: (json) => {
    const refs = (json as Record<string, unknown>).FileReferences
    return !!refs && typeof refs === 'object'
      && typeof (refs as Record<string, unknown>).Moc === 'string'
      && Array.isArray((refs as Record<string, unknown>).Textures)
  },
  createSettings: (runtime, json, url) => {
    const runtimeSettings = { ...json, url }
    const cubismRuntime = runtime.Live2DFactory.findRuntime(runtimeSettings)
    if (!cubismRuntime)
      throw new Error(`Cubism 4 model "${url}" is unsupported by the currently available runtime.`)
    return cubismRuntime.createModelSettings(runtimeSettings)
  },
  sanitizeSettings: (json) => {
    const sanitized = structuredClone(json) as Record<string, unknown>
    const refs = sanitized.FileReferences
    if (refs && typeof refs === 'object') {
      const fileReferences = refs as Record<string, unknown>
      for (const key of ['Physics', 'Pose', 'DisplayInfo']) {
        if (fileReferences[key] === null)
          delete fileReferences[key]
      }
    }
    return sanitized as JSONObject
  },
  assetReferences: references,
  isLoadedModel: model => !('getParamFloat' in model.coreModel) || !('setParamFloat' in model.coreModel),
  prepareModel: prepareCubism4Model,
  runtimeTimeToMilliseconds: time => time * 1000,
}
