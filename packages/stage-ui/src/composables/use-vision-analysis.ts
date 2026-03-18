import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { VisionAnalysisResult } from '../types'

import { ref } from 'vue'

import { analyzeScreenWithVision, ImageSizeExceededError } from '../services/vision-analyzer'

export interface UseVisionAnalysisOptions {
  getVisionConfig: () => {
    enabled: boolean
    activeVisionProvider: string
    activeVisionModel: string
  }
  getProviderInstance: (providerId: string) => Promise<ChatProvider>
}

export interface UseVisionAnalysisReturn {
  analysisResult: ReturnType<typeof ref<VisionAnalysisResult | null>>
  isAnalyzing: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<string | null>>
  analyzeScreen: (imageBase64: string) => Promise<VisionAnalysisResult | null>
  setAnalysisResult: (result: VisionAnalysisResult | null) => void
}

export function useVisionAnalysis(options: UseVisionAnalysisOptions): UseVisionAnalysisReturn {
  const { getVisionConfig, getProviderInstance } = options

  const analysisResult = ref<VisionAnalysisResult | null>(null)
  const isAnalyzing = ref(false)
  const error = ref<string | null>(null)

  async function analyzeScreen(imageBase64: string): Promise<VisionAnalysisResult | null> {
    if (isAnalyzing.value) {
      return null
    }

    isAnalyzing.value = true
    error.value = null

    try {
      const config = getVisionConfig()

      if (!config.enabled || !config.activeVisionProvider || !config.activeVisionModel) {
        error.value = 'Vision analysis is not configured. Please enable and configure a vision provider.'
        analysisResult.value = {
          description: 'Vision analysis not configured',
          elements: [],
          suggestions: [],
        }
        return analysisResult.value
      }

      const provider = await getProviderInstance(config.activeVisionProvider)

      const result = await analyzeScreenWithVision({
        provider,
        model: config.activeVisionModel,
        imageBase64,
      })
      analysisResult.value = result
      return result
    }
    catch (e) {
      if (e instanceof ImageSizeExceededError) {
        error.value = e.message
      }
      else {
        error.value = e instanceof Error ? e.message : 'Failed to analyze screen'
      }
      analysisResult.value = {
        description: 'Analysis unavailable',
        elements: [],
        suggestions: [],
      }
      return null
    }
    finally {
      isAnalyzing.value = false
    }
  }

  function setAnalysisResult(result: VisionAnalysisResult | null) {
    analysisResult.value = result
  }

  return {
    analysisResult,
    isAnalyzing,
    error,
    analyzeScreen,
    setAnalysisResult,
  }
}
