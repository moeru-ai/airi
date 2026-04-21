/**
 * Inference model preloading composable.
 *
 * Reads the user's provider configuration and preloads local inference
 * models (Kokoro TTS, Whisper ASR) in the background after a delay.
 * Only preloads models whose providers are configured and added by the user.
 *
 * Call `triggerPreload()` once during app initialization (e.g. in App.vue
 * onMounted, after stores are initialized).
 */

import { detectWebGPU, getCachedWebGPUCapabilities } from '@proj-airi/stage-shared/webgpu'

import { getKokoroAdapter } from '../libs/inference/adapters/kokoro'
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
    const tasks: { modelId: string, loader: () => Promise<void> }[] = []

    // Check if Kokoro TTS is configured
    if (providersStore.configuredProviders['kokoro-local']) {
      const config = providersStore.getProviderConfig('kokoro-local')
      const capabilities = getCachedWebGPUCapabilities()
      const hasWebGPU = capabilities?.supported ?? false
      const fp16Supported = capabilities?.fp16Supported ?? false

      // Determine which model to preload
      const modelId = (config?.model as string) || getDefaultKokoroModel(hasWebGPU, fp16Supported)
      const modelDef = KOKORO_MODELS.find(m => m.id === modelId)

      if (modelDef) {
        tasks.push({
          modelId: `kokoro-${modelDef.id}`,
          loader: async () => {
            const adapter = await getKokoroAdapter()
            await adapter.loadModel(modelDef.quantization, modelDef.platform)
          },
        })
      }
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
