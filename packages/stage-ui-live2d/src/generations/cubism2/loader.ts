import type { JSONObject } from 'pixi-live2d-display'

import type { Live2DGenerationLoader } from '../loader'

import { prepareCubism2Model } from './model'

function references(json: JSONObject) {
  const settings = json as Record<string, unknown>
  const result: ReturnType<Live2DGenerationLoader['assetReferences']> = []
  for (const [key, kind] of [['model', 'MOC'], ['physics', 'Physics'], ['pose', 'Pose']] as const) {
    if (typeof settings[key] === 'string')
      result.push({ path: settings[key], kind })
  }
  if (Array.isArray(settings.textures))
    settings.textures.forEach(path => typeof path === 'string' && result.push({ path, kind: 'Texture' }))
  if (settings.motions && typeof settings.motions === 'object') {
    for (const definitions of Object.values(settings.motions)) {
      if (Array.isArray(definitions)) {
        definitions.forEach((definition) => {
          if (definition && typeof definition === 'object' && 'file' in definition && typeof definition.file === 'string')
            result.push({ path: definition.file, kind: 'Motion' })
        })
      }
    }
  }
  if (Array.isArray(settings.expressions)) {
    settings.expressions.forEach((definition) => {
      if (definition && typeof definition === 'object' && 'file' in definition && typeof definition.file === 'string')
        result.push({ path: definition.file, kind: 'Expression' })
    })
  }
  return result
}

export const cubism2Loader: Live2DGenerationLoader = {
  generation: 'cubism2',
  isSettingsPath: path => path.toLowerCase().endsWith('model.json'),
  isSettingsJSON: (json) => {
    const candidate = json as { model?: unknown, textures?: unknown }
    return typeof candidate.model === 'string'
      && Array.isArray(candidate.textures)
      && candidate.textures.length > 0
      && candidate.textures.every(texture => typeof texture === 'string')
  },
  createSettings: (runtime, json, url) => {
    const runtimeSettings = { ...json, url }
    const cubismRuntime = runtime.Live2DFactory.findRuntime(runtimeSettings)
    if (!cubismRuntime) {
      throw new Error(
        `Cubism 2 model "${url}" needs the proprietary live2d.min.js core, which is not present in this build. `
        + `Configure it through the Live2D SDK Vite plugin, then check the build log if provisioning was skipped or failed.`,
      )
    }
    return cubismRuntime.createModelSettings(runtimeSettings)
  },
  sanitizeSettings: json => json,
  assetReferences: references,
  isLoadedModel: model => 'getParamFloat' in model.coreModel && 'setParamFloat' in model.coreModel,
  prepareModel: prepareCubism2Model,
  disableIdleEyeMovement: () => {},
  runtimeTimeToMilliseconds: time => time,
}
