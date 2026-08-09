/// <reference types="@proj-airi/unplugin-live2d-sdk/types" />

import type { Cubism2CoreCapability } from '@proj-airi/unplugin-live2d-sdk/vite'
import type * as Live2DDisplay from 'pixi-live2d-display'
import type { InternalModel, Live2DFactoryOptions, Live2DModel } from 'pixi-live2d-display'

import { errorMessageFrom } from '@moeru/std'
import { cubism2Core } from 'virtual:live2d-sdk/cores'

import { loaderForModel } from '../generations/loader'

export type Live2DRuntime = typeof Live2DDisplay

export interface ResolvedLive2DRuntime {
  runtime: Live2DRuntime
  supportsCubism2: boolean
}

let runtimePromise: Promise<ResolvedLive2DRuntime> | undefined

interface RuntimeDependencies<TRuntime> {
  capability: Cubism2CoreCapability
  loadCore: (url: string, sri: string, expectedGlobal: string) => Promise<void>
  loadCombined: () => Promise<TRuntime>
  loadCubism4: () => Promise<TRuntime>
  configure: (runtime: TRuntime) => Promise<void>
}

function loadCubism2Core(url: string, sri: string, expectedGlobal: string): Promise<void> {
  if (expectedGlobal in window)
    return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
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
}

async function configureRuntime(runtime: Live2DRuntime): Promise<void> {
  const { configureLive2DLoaders } = await import('./live2d-zip-loader')
  configureLive2DLoaders(runtime)

  const { registerLive2DOpfs } = await import('./live2d-opfs-registration')
  registerLive2DOpfs(runtime)
}

const runtimeDependencies: RuntimeDependencies<Live2DRuntime> = {
  capability: cubism2Core,
  loadCore: loadCubism2Core,
  loadCombined: () => import('pixi-live2d-display'),
  loadCubism4: () => import('pixi-live2d-display/cubism4'),
  configure: configureRuntime,
}

/**
 * Selects and configures a runtime while treating Cubism 2 as optional.
 *
 * The dependencies are browser/module boundaries. Keeping them explicit lets
 * callers verify failure policy without evaluating either graphics runtime.
 */
export async function selectLive2DRuntime<TRuntime>(dependencies: RuntimeDependencies<TRuntime>): Promise<{ runtime: TRuntime, supportsCubism2: boolean }> {
  const loadCubism4 = async () => {
    const runtime = await dependencies.loadCubism4()
    await dependencies.configure(runtime)
    return { runtime, supportsCubism2: false }
  }

  if (!dependencies.capability.available)
    return loadCubism4()

  try {
    // The combined bundle reads both Core globals while the module evaluates,
    // so loading the optional Cubism 2 Core first is a strict ordering rule.
    await dependencies.loadCore(
      dependencies.capability.url,
      dependencies.capability.sri,
      dependencies.capability.expectedGlobal,
    )
    const runtime = await dependencies.loadCombined()
    await dependencies.configure(runtime)
    return { runtime, supportsCubism2: true }
  }
  catch (error) {
    console.error(`[Live2D] Cubism 2 runtime unavailable; continuing with Cubism 4: ${errorMessageFrom(error) ?? 'unknown error'}`)
    return loadCubism4()
  }
}

/**
 * Resolves the Live2D runtime once for the application lifetime.
 *
 * Cubism 2 is optional. A configured Core is loaded before the combined bundle
 * is evaluated; any Core or combined-runtime failure falls back to Cubism 4 so
 * existing models remain usable and validation observes the resolved result.
 */
export function resolveLive2DRuntime(): Promise<ResolvedLive2DRuntime> {
  runtimePromise ??= selectLive2DRuntime(runtimeDependencies)

  return runtimePromise
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
