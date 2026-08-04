import type { JSONObject, ModelSettings } from 'pixi-live2d-display'

import type { Live2DRuntime } from '../utils/live2d-runtime'

import { cubism2Loader } from './cubism2/loader'
import { cubism4Loader } from './cubism4/loader'

export type Live2DGeneration = 'cubism2' | 'cubism4'

export interface Live2DAssetReference {
  path: string
  kind: 'MOC' | 'Texture' | 'Motion' | 'Expression' | 'Physics' | 'Pose' | 'DisplayInfo'
}

export interface LoadedLive2DModel {
  coreModel: object
  settings?: object
  updateWebGLContext?: (gl: WebGLRenderingContext, contextId: number) => void
  eyeBlink?: unknown
}

/** Owns every semantic difference between one supported Cubism generation and another. */
export interface Live2DGenerationLoader {
  readonly generation: Live2DGeneration
  isSettingsPath: (path: string) => boolean
  isSettingsJSON: (json: JSONObject) => boolean
  createSettings: (runtime: Live2DRuntime, json: JSONObject, url: string) => ModelSettings
  sanitizeSettings: (json: JSONObject) => JSONObject
  assetReferences: (json: JSONObject) => Live2DAssetReference[]
  isLoadedModel: (model: LoadedLive2DModel) => boolean
  prepareModel: (model: LoadedLive2DModel, renderer: object) => void
  runtimeTimeToMilliseconds: (time: number) => number
}

export interface ParsedSettingsCandidate {
  path: string
  json: JSONObject
}

export interface SelectedSettings {
  path: string
  json: JSONObject
  loader: Live2DGenerationLoader
}

export const live2DGenerationLoaders = [cubism2Loader, cubism4Loader] as const

/** Selects the single settings entry claimed by both its path and parsed JSON shape. */
export function selectLive2DSettings(candidates: ParsedSettingsCandidate[]): SelectedSettings {
  const matches = candidates.flatMap(candidate => live2DGenerationLoaders
    .filter(loader => loader.isSettingsPath(candidate.path) && loader.isSettingsJSON(candidate.json))
    .map(loader => ({ ...candidate, loader })))

  if (matches.length !== 1)
    throw new Error(`Expected exactly one supported Live2D settings entry point, found ${matches.length}.`)

  return matches[0]
}

/** Finds the semantic loader for an initialized model without retaining state from a prior load. */
export function loaderForModel(model: LoadedLive2DModel): Live2DGenerationLoader {
  const matches = live2DGenerationLoaders.filter(loader => loader.isLoadedModel(model))
  if (matches.length !== 1)
    throw new Error(`Expected exactly one Live2D generation for the loaded model, found ${matches.length}.`)
  return matches[0]
}
