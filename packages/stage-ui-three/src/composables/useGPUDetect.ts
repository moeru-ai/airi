import { ref, onMounted } from 'vue'
import { getGPUTier } from 'detect-gpu'

export type GPUTier = 0 | 1 | 2 | 3

export interface GPUCapabilities {
  tier: GPUTier
  isMobile: boolean
  gpu: string
  fps: number
}

export function useGPUDetect() {
  const capabilities = ref<GPUCapabilities>({
    tier: 1,
    isMobile: false,
    gpu: 'unknown',
    fps: 30,
  })

  const isReady = ref(false)

  async function detect(): Promise<GPUCapabilities> {
    try {
      const gpuTier = await getGPUTier()
      
      capabilities.value = {
        tier: gpuTier.tier as GPUTier,
        isMobile: gpuTier.isMobile ?? false,
        gpu: gpuTier.gpu ?? 'unknown',
        fps: gpuTier.fps ?? 30,
      }
    } catch {
      capabilities.value = {
        tier: 1,
        isMobile: false,
        gpu: 'fallback',
        fps: 30,
      }
    }

    isReady.value = true
    return capabilities.value
  }

  const lowTierSettings = {
    pixelRatio: 1,
    shadowMapSize: 512,
    antialias: false,
    postProcessing: false,
    maxLights: 2,
  }

  function getOptimalSettings(tier: GPUTier) {
    const settings = {
      0: lowTierSettings,
      1: lowTierSettings,
      2: {
        pixelRatio: Math.min(window.devicePixelRatio, 1.5),
        shadowMapSize: 1024,
        antialias: true,
        postProcessing: true,
        maxLights: 4,
      },
      3: {
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        shadowMapSize: 2048,
        antialias: true,
        postProcessing: true,
        maxLights: 8,
      },
    }
    return settings[tier]
  }

  onMounted(() => {
    detect()
  })

  return {
    capabilities,
    isReady,
    detect,
    getOptimalSettings,
  }
}
