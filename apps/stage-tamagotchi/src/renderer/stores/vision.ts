import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { visionCaptureScreen, visionSetAutoCapture } from '../../shared/vision'

export interface Screenshot {
  image: string
  timestamp: number
}

export interface AnalysisResult {
  description: string
  elements: Array<{
    type: string
    description: string
    position: { x: number, y: number, width: number, height: number }
  }>
  suggestions?: string[]
}

let cachedContext: ReturnType<typeof createContext>['context'] | undefined

function getContext() {
  if (!cachedContext) {
    const { context } = createContext(window.electron.ipcRenderer)
    cachedContext = context
  }
  return cachedContext
}

export const useVisionStore = defineStore('tamagotchi-vision', () => {
  const captureScreenshot = defineInvoke(getContext(), visionCaptureScreen)
  const setAutoCapture = defineInvoke(getContext(), visionSetAutoCapture)

  const screenshot = ref<Screenshot | null>(null)
  const analysisResult = ref<AnalysisResult | null>(null)
  const isCapturing = ref(false)
  const isAnalyzing = ref(false)
  const error = ref<string | null>(null)
  const autoCaptureEnabled = ref(false)
  const cooldownRemaining = ref(0)

  const cooldownDuration = 5000
  let cooldownTimer: ReturnType<typeof setInterval> | null = null

  const canCapture = computed(() => !isCapturing.value && cooldownRemaining.value === 0)

  async function captureScreen() {
    if (!canCapture.value) {
      return
    }

    isCapturing.value = true
    error.value = null

    try {
      const result = await captureScreenshot(undefined)
      if (result?.error) {
        if (result.error === 'cooldown_active') {
          error.value = 'Cooldown active'
        }
        else if (result.error === 'no_sources') {
          error.value = 'No screen sources available'
        }
        else {
          error.value = result.error
        }
        return
      }

      if (result?.image) {
        screenshot.value = {
          image: result.image,
          timestamp: result.timestamp,
        }
        startCooldown()
      }
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to capture screen'
    }
    finally {
      isCapturing.value = false
    }
  }

  async function captureAndAnalyze(sendToAiri = true) {
    await captureScreen()
    if (screenshot.value) {
      await analyzeScreen(sendToAiri)
    }
  }

  async function analyzeScreen(sendToAiri = true) {
    if (!screenshot.value || isAnalyzing.value) {
      return
    }

    isAnalyzing.value = true
    error.value = null

    try {
      const { analyzeScreenWithAI } = await import('@proj-airi/stage-ui/services/vision-analyzer')

      const { useVisionModuleStore } = await import('@proj-airi/stage-ui/stores/modules/vision')
      const visionModuleStore = useVisionModuleStore()

      const modelConfig = visionModuleStore.enabled ? {
        provider: visionModuleStore.model.provider,
        modelName: visionModuleStore.model.modelName,
        apiKey: visionModuleStore.model.apiKey || undefined,
        baseUrl: visionModuleStore.model.baseUrl || undefined,
      } : undefined

      const result = await analyzeScreenWithAI(screenshot.value.image, undefined, modelConfig)
      analysisResult.value = result

      if (sendToAiri) {
        await sendToAiriWithVision(result)
      }
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to analyze screen'
      analysisResult.value = {
        description: 'Analysis unavailable',
        elements: [],
        suggestions: [],
      }
    }
    finally {
      isAnalyzing.value = false
    }
  }

  async function sendToAiriWithVision(result: AnalysisResult) {
    try {
      const { useChatOrchestratorStore } = await import('@proj-airi/stage-ui/stores/chat')
      const { useConsciousnessStore } = await import('@proj-airi/stage-ui/stores/modules/consciousness')
      const { useProvidersStore } = await import('@proj-airi/stage-ui/stores/providers')

      const chatOrchestrator = useChatOrchestratorStore()
      const consciousnessStore = useConsciousnessStore()
      const providersStore = useProvidersStore()

      const { activeProvider, activeModel } = consciousnessStore
      const providerConfig = providersStore.getProviderConfig(activeProvider)

      const visionContext = `
我刚刚让 AIRI 看了屏幕，以下是屏幕分析结果：

**屏幕描述：** ${result.description}

**UI 元素：**
${result.elements.map(el => `- [${el.type}] ${el.description} (位置: ${el.position.x}, ${el.position.y})`).join('\n') || '无'}

**建议操作：**
${result.suggestions?.map(s => `- ${s}`).join('\n') || '无'}

请根据这个屏幕分析结果来回答我的问题。
`.trim()

      const chatProvider = await providersStore.getProviderInstance(activeProvider) as any

      await chatOrchestrator.ingest(visionContext, {
        model: activeModel,
        chatProvider,
        providerConfig,
      })
    }
    catch (e) {
      console.error('[Vision] Failed to send to AIRI:', e)
    }
  }

  function startCooldown() {
    cooldownRemaining.value = cooldownDuration
    cooldownTimer = setInterval(() => {
      cooldownRemaining.value = Math.max(0, cooldownRemaining.value - 1000)
      if (cooldownRemaining.value === 0 && cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
      }
    }, 1000)
  }

  async function enableAutoCapture(interval = 30000) {
    try {
      await setAutoCapture({ enabled: true, interval })
      autoCaptureEnabled.value = true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to enable auto capture'
    }
  }

  async function disableAutoCapture() {
    try {
      await setAutoCapture({ enabled: false })
      autoCaptureEnabled.value = false
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to disable auto capture'
    }
  }

  function setAnalysisResult(result: AnalysisResult | null) {
    analysisResult.value = result
  }

  function clearError() {
    error.value = null
  }

  function clearScreenshot() {
    screenshot.value = null
    analysisResult.value = null
  }

  return {
    screenshot,
    analysisResult,
    isCapturing,
    isAnalyzing,
    error,
    autoCaptureEnabled,
    cooldownRemaining,
    canCapture,
    captureScreen,
    captureAndAnalyze,
    analyzeScreen,
    enableAutoCapture,
    disableAutoCapture,
    setAnalysisResult,
    clearError,
    clearScreenshot,
  }
})
