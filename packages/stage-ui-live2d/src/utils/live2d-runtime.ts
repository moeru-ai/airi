import type * as Live2DDisplay from 'pixi-live2d-display'

import { errorMessageFrom } from '@moeru/std'

/**
 * Path of the emitted Cubism 2 core relative to the app base, or `null` in a
 * build that carries no core. Injected by the `Cubism2Core` Vite plugin.
 */
declare const __AIRI_CUBISM2_CORE_PATH__: string | null

/**
 * Resolves the emitted core against the base URL the app was built for.
 *
 * NOTICE:
 * The join is what makes packaged stage-tamagotchi work. Its renderer builds
 * with `base: './'` and loads over `file://`, so a root-anchored `/assets/...`
 * would resolve against the filesystem root rather than the renderer directory
 * holding the asset. Because the plugin's define is a plain runtime string
 * assigned to `script.src`, Vite cannot rewrite it the way it rewrites the same
 * path in `index.html`, so the base has to be applied here.
 *
 * Vite normalises a resolved base to end in `/` (`./` for a relative base, `/`
 * in dev and for the web and pocket apps), so concatenation is enough.
 */
function coreUrlFrom(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

declare global {
  interface Window {
    Live2D?: unknown
  }
}

export type Live2DRuntime = typeof Live2DDisplay

let runtimePromise: Promise<Live2DRuntime> | undefined
let coreScriptPromise: Promise<void> | undefined

function loadCubism2Core(url: string): Promise<void> {
  if (window.Live2D)
    return Promise.resolve()

  coreScriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.addEventListener('load', () => {
      if (!window.Live2D) {
        reject(new Error('The configured Cubism 2 core loaded without exposing window.Live2D.'))
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
    const cubism2CoreUrl = typeof __AIRI_CUBISM2_CORE_PATH__ === 'string'
      ? coreUrlFrom(__AIRI_CUBISM2_CORE_PATH__)
      : null

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
    const runtime = cubism2CoreUrl
      ? await loadCubism2Core(cubism2CoreUrl).then(importCombinedRuntime)
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
  return typeof __AIRI_CUBISM2_CORE_PATH__ === 'string'
    && __AIRI_CUBISM2_CORE_PATH__.length > 0
}
