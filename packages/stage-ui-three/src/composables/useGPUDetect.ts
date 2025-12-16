import { ref, onMounted } from 'vue'

export type GPUTier = 'high' | 'medium' | 'low' | 'unknown'

export interface GPUCapabilities {
  webgpu: boolean
  webgl2: boolean
  webgl: boolean
  tier: GPUTier
  maxTextureSize: number
  maxAnisotropy: number
  floatTextures: boolean
  instancedArrays: boolean
}

export function useGPUDetect() {
  const capabilities = ref<GPUCapabilities>({
    webgpu: false,
    webgl2: false,
    webgl: false,
    tier: 'unknown',
    maxTextureSize: 0,
    maxAnisotropy: 0,
    floatTextures: false,
    instancedArrays: false,
  })

  const isReady = ref(false)

  async function detect(): Promise<GPUCapabilities> {
    const caps = capabilities.value

    caps.webgpu = 'gpu' in navigator
    
    const canvas = document.createElement('canvas')
    
    const gl2 = canvas.getContext('webgl2')
    if (gl2) {
      caps.webgl2 = true
      caps.maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE)
      const ext = gl2.getExtension('EXT_texture_filter_anisotropic')
      if (ext) {
        caps.maxAnisotropy = gl2.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
      }
      caps.floatTextures = !!gl2.getExtension('EXT_color_buffer_float')
      caps.instancedArrays = true
    } else {
      const gl = canvas.getContext('webgl')
      if (gl) {
        caps.webgl = true
        caps.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
        const ext = gl.getExtension('EXT_texture_filter_anisotropic')
        if (ext) {
          caps.maxAnisotropy = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
        }
        caps.floatTextures = !!gl.getExtension('OES_texture_float')
        caps.instancedArrays = !!gl.getExtension('ANGLE_instanced_arrays')
      }
    }

    if (caps.webgpu && caps.maxTextureSize >= 8192) {
      caps.tier = 'high'
    } else if (caps.webgl2 && caps.maxTextureSize >= 4096) {
      caps.tier = 'medium'
    } else if (caps.webgl) {
      caps.tier = 'low'
    }

    isReady.value = true
    return caps
  }

  function getOptimalSettings(tier: GPUTier) {
    const lowTierSettings = {
      pixelRatio: 1,
      shadowMapSize: 512,
      antialias: false,
      postProcessing: false,
      maxLights: 2,
    }

    const settings = {
      high: {
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        shadowMapSize: 2048,
        antialias: true,
        postProcessing: true,
        maxLights: 8,
      },
      medium: {
        pixelRatio: Math.min(window.devicePixelRatio, 1.5),
        shadowMapSize: 1024,
        antialias: true,
        postProcessing: true,
        maxLights: 4,
      },
      low: lowTierSettings,
      unknown: lowTierSettings,
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
