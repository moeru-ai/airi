/// <reference types="@proj-airi/unplugin-live2d-sdk/types" />

import type * as Live2DDisplay from 'pixi-live2d-display'
import type { InternalModel, Live2DFactoryOptions, Live2DModel } from 'pixi-live2d-display'

import { errorMessageFrom } from '@moeru/std'
import { cubism2Core } from 'virtual:live2d-sdk/cores'

import { loaderForModel } from '../generations/loader'

declare global {
  interface Window {
    Live2D?: unknown
  }
}

export type Live2DRuntime = typeof Live2DDisplay

let runtimePromise: Promise<Live2DRuntime> | undefined
let coreScriptPromise: Promise<void> | undefined

function loadCubism2Core(url: string, sri: string, expectedGlobal: string): Promise<void> {
  if (expectedGlobal in window)
    return Promise.resolve()

  if (!coreScriptPromise) {
    const script = document.createElement('script')
    script.src = url
    script.integrity = sri
    script.crossOrigin = 'anonymous'
    script.async = true

    coreScriptPromise = new Promise<void>((resolve, reject) => {
      script.addEventListener('load', () => {
        if (!(expectedGlobal in window)) {
          reject(new Error(`The configured Cubism 2 core loaded without exposing window.${expectedGlobal}.`))
          return
        }
        resolve()
      }, { once: true })
      script.addEventListener('error', () => reject(new Error(`Failed to load the configured Cubism 2 core from "${url}".`)), { once: true })
      document.head.appendChild(script)
    }).catch((error) => {
      script.remove()
      coreScriptPromise = undefined
      throw error
    })
  }

  return coreScriptPromise
}

async function importCombinedRuntime(): Promise<Live2DRuntime> {
  try {
    return await import('pixi-live2d-display')
  }
  catch (error) {
    throw new Error(
      `Failed to evaluate the combined Live2D runtime bundle: ${errorMessageFrom(error) ?? 'unknown error'}. `
      + `It requires both window.Live2D and window.Live2DCubismCore to exist before the bundle is imported.`,
      { cause: error },
    )
  }
}

async function importAvailableRuntime(): Promise<Live2DRuntime> {
  if (!cubism2Core.available)
    return import('pixi-live2d-display/cubism4')

  try {
    await loadCubism2Core(cubism2Core.url, cubism2Core.sri, cubism2Core.expectedGlobal)
    return await importCombinedRuntime()
  }
  catch (error) {
    // Cubism 2 is an optional capability. A missing Core, rejected SRI, CSP
    // policy, or combined-bundle failure must not take Cubism 4/5 down with it.
    console.warn('[Live2D] Cubism 2 runtime unavailable; continuing with Cubism 4/5 only.', error)
    return import('pixi-live2d-display/cubism4')
  }
}

/** Loads and configures the one pixi-live2d-display bundle used for the application lifetime. */
export function loadLive2DRuntime(): Promise<Live2DRuntime> {
  runtimePromise ??= (async () => {
    const runtime = await importAvailableRuntime()

    const { configureLive2DLoaders } = await import('./live2d-zip-loader')
    configureLive2DLoaders(runtime)

    const { registerLive2DOpfs } = await import('./live2d-opfs-registration')
    registerLive2DOpfs(runtime)

    return runtime
  })()

  return runtimePromise
}

export function isCubism2RuntimeConfigured(): boolean {
  return cubism2Core.available
}

/** Sets up a model through the SDK, then runs exactly one generation-specific preparation pass. */
export async function setupLive2DModel<IM extends InternalModel>(
  runtime: Live2DRuntime,
  model: Live2DModel<IM>,
  source: string | object | IM['settings'],
  renderer: object,
  options?: Live2DFactoryOptions,
): Promise<Live2DModel<IM>> {
  await runtime.Live2DFactory.setupLive2DModel(model, source, options)
  loaderForModel(model.internalModel).prepareModel(model.internalModel, renderer)
  return model
}
