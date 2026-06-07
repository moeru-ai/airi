/**
 * Inference model preloading composable.
 *
 * Reads the user's provider configuration and preloads local inference
 * models (Kokoro TTS, RWKV chat) in the background after a delay.
 * Only preloads models whose providers are configured and added by the user.
 *
 * Call `triggerPreload()` once during app initialization (e.g. in App.vue
 * onMounted, after stores are initialized).
 */

import { detectWebGPU, getCachedWebGPUCapabilities, isWebGPUSupported } from '@proj-airi/stage-shared/webgpu'

import { getKokoroAdapter } from '../libs/inference/adapters/kokoro'
import { getWebRwkvAdapter } from '../libs/inference/adapters/web-rwkv'
import { DEFAULT_WEB_RWKV_MODEL } from '../libs/inference/constants'
import { useProvidersStore } from '../stores/providers'
import { getDefaultKokoroModel, KOKORO_MODELS } from '../workers/kokoro/constants'
import { useModelPreload } from './use-model-preload'

export interface UseInferencePreloadOptions {
  /** Delay in ms before starting preloads (default: 3000) */
  delayMs?: number
}

export function useInferencePreload(options: UseInferencePreloadOptions = {}) {
  const { delayMs = 3000 } = options

  const preload = useModelPreload({ delayMs })

  /**
   * Check provider configuration and schedule preloads for any
   * configured local inference providers.
   *
   * Should be called once after app stores are initialized.
   */
  async function triggerPreload(): Promise<void> {
    // Ensure WebGPU capabilities are cached for downstream use
    await detectWebGPU()

    const providersStore = useProvidersStore()
    const tasks: { modelId: string, loader: (signal: AbortSignal) => Promise<void> }[] = []

    // Check if Kokoro TTS is configured
    if (providersStore.configuredProviders['kokoro-local']) {
      const config = providersStore.getProviderConfig('kokoro-local')

      // Determine which model to preload
      const modelId = (config?.model as string) || getDefaultKokoroModel(getCachedWebGPUCapabilities())
      const modelDef = KOKORO_MODELS.find(m => m.id === modelId)

      if (modelDef) {
        tasks.push({
          modelId: `kokoro-${modelDef.id}`,
          loader: async (signal) => {
            const adapter = await getKokoroAdapter()
            await adapter.loadModel(modelDef.quantization, modelDef.platform, { signal })
          },
        })
      }
    }

    // Check if RWKV (local, WebGPU) is configured. web-rwkv is WebGPU-only (no
    // WASM/CPU fallback), so skip the preload where WebGPU is unavailable rather
    // than spawning a worker that can only fail. Preloading here loads the model
    // outside any chat request — so it completes, populates the OPFS weight cache,
    // and reaches `ready` before the first message instead of loading lazily mid-request.
    if (providersStore.configuredProviders['web-rwkv'] && await isWebGPUSupported()) {
      const config = providersStore.getProviderConfig('web-rwkv')
      const modelUrl = (config?.model as string) || DEFAULT_WEB_RWKV_MODEL
      const vocab = (config?.vocab as string) || undefined

      tasks.push({
        modelId: `web-rwkv-${modelUrl}`,
        loader: async (signal) => {
          const adapter = await getWebRwkvAdapter()
          await adapter.loadModel(modelUrl, vocab, { signal })
        },
      })
    }

    // NOTICE: Whisper preloading is intentionally omitted here.
    // Whisper's model (~800 MB) is too large to preload eagerly —
    // it should only be loaded when the user explicitly enables ASR.
    // If this changes in the future, add a similar block checking
    // for a configured 'whisper-local' provider.

    if (tasks.length > 0) {
      preload.schedulePreload(tasks)
    }
  }

  return {
    ...preload,
    triggerPreload,
  }
}
