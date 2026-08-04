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

  coreScriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.integrity = sri
    script.crossOrigin = 'anonymous'
    script.async = true
    script.addEventListener('load', () => {
      if (!(expectedGlobal in window)) {
        reject(new Error(`The configured Cubism 2 core loaded without exposing window.${expectedGlobal}.`))
        return
      }

      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load the configured Cubism 2 core from "${url}".`)), { once: true })
    document.head.appendChild(script)
  })

  return coreScriptPromise
}

/**
 * Imports the combined bundle, which carries both Cubism runtimes.
 *
 * Both core globals must already exist; see the invariant recorded in
 * {@link loadLive2DRuntime}. A module-evaluation failure is rethrown naming that
 * requirement, because the upstream message alone does not identify the owner.
 */
async function importCombinedRuntime(): Promise<Live2DRuntime> {
  try {
    return await import('pixi-live2d-display')
  }
  catch (error) {
    throw new Error(
      `Failed to evaluate the combined Live2D runtime bundle: ${errorMessageFrom(error) ?? 'unknown error'}. `
      + `It requires both window.Live2D (the Cubism 2 core loaded above) and window.Live2DCubismCore `
      + `(the live2dcubismcore.min.js <script> in the app's index.html) to already exist at import time.`,
      { cause: error },
    )
  }
}

/**
 * Loads the one pixi-live2d-display bundle used for the application lifetime.
 *
 * The combined bundle must only be evaluated after the proprietary Cubism 2
 * core has created `window.Live2D`. Builds without that core retain the
 * existing Cubism 3+ bundle and reject Cubism 2 models during validation.
 */
export function loadLive2DRuntime(): Promise<Live2DRuntime> {
  runtimePromise ??= (async () => {
    // NOTICE:
    // The combined bundle needs BOTH Cubism cores on `window` before it is
    // imported, not before a model is created, so ordering here is load-bearing.
    //
    // It asserts them at module evaluation time: `window.Live2D` at
    // `node_modules/pixi-live2d-display/dist/index.es.js:1549` ("Could not find
    // Cubism 2 runtime. This plugin requires live2d.min.js to be loaded.") and
    // `window.Live2DCubismCore` at `index.es.js:2122` ("Could not find Cubism 4
    // runtime. This plugin requires live2dcubismcore.js to be loaded.").
    //
    // `loadCubism2Core` satisfies the first. Nothing in this package satisfies
    // the second: it holds only because every app ships a blocking classic
    // <script> for the modern core ahead of its module entry —
    // `apps/stage-web/index.html:43`, `apps/stage-pocket/index.html:43`, and
    // `apps/stage-tamagotchi/src/renderer/index.html:18`. Dropping or deferring
    // any of those tags breaks every Live2D load in a Cubism-2-enabled build,
    // and the bare module-eval throw never names the missing tag, hence the
    // wrapper.
    //
    // The Cubism 3+-only bundle carries just the second assertion, so it is
    // imported directly.
    //
    // Removal condition: pixi-live2d-display (0.4.0 today) moves core detection
    // out of module scope, or this package loads the modern core itself.
    const runtime = cubism2Core.available
      ? await loadCubism2Core(cubism2Core.url, cubism2Core.sri, cubism2Core.expectedGlobal).then(importCombinedRuntime)
      : await import('pixi-live2d-display/cubism4')

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
