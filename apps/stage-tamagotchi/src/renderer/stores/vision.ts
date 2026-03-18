import type { AnalysisResult, Screenshot } from '@proj-airi/stage-ui/types'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useVisionAnalysis, useVisionCapture, useVisionChatIntegration } from '@proj-airi/stage-ui/composables'
import { useVisionModuleStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { visionCaptureScreen, visionSetAutoCapture } from '../../shared/vision'

let cachedContext: ReturnType<typeof createContext>['context'] | undefined

function getContext() {
  if (!cachedContext) {
    const { context } = createContext(window.electron.ipcRenderer)
    cachedContext = context
  }
  return cachedContext
}

export const useVisionStore = defineStore('tamagotchi-vision', () => {
  const visionModuleStore = useVisionModuleStore()
  const providersStore = useProvidersStore()
  const { cooldown } = storeToRefs(visionModuleStore)

  const captureScreenshot = defineInvoke(getContext(), visionCaptureScreen)
  const setAutoCapture = defineInvoke(getContext(), visionSetAutoCapture)

  const autoCaptureEnabled = ref(false)

  const visionCapture = useVisionCapture({
    captureScreenshot: async () => captureScreenshot(undefined),
    get cooldownDuration() { return cooldown.value },
  })

  const visionAnalysis = useVisionAnalysis({
    getVisionConfig: () => ({
      enabled: visionModuleStore.enabled,
      activeVisionProvider: visionModuleStore.activeVisionProvider,
      activeVisionModel: visionModuleStore.activeVisionModel,
    }),
    getProviderInstance: providerId => providersStore.getProviderInstance<ChatProvider>(providerId),
  })

  const visionChatIntegration = useVisionChatIntegration()

  const screenshot = computed(() => visionCapture.screenshot.value)
  const analysisResult = computed(() => visionAnalysis.analysisResult.value)
  const isCapturing = computed(() => visionCapture.isCapturing.value)
  const isAnalyzing = computed(() => visionAnalysis.isAnalyzing.value)
  const error = computed(() => visionCapture.error.value || visionAnalysis.error.value)
  const cooldownRemaining = computed(() => visionCapture.cooldownRemaining.value)
  const canCapture = computed(() => visionCapture.canCapture.value)

  async function captureScreen() {
    await visionCapture.captureScreen()
  }

  async function captureAndAnalyze(sendToAiri = true) {
    await captureScreen()
    if (visionCapture.screenshot.value) {
      await analyzeScreen(sendToAiri)
    }
  }

  async function analyzeScreen(sendToAiri = true) {
    const imageBase64 = visionCapture.screenshot.value?.image
    if (!imageBase64 || visionAnalysis.isAnalyzing.value) {
      return
    }

    const result = await visionAnalysis.analyzeScreen(imageBase64)

    if (sendToAiri && result) {
      await visionChatIntegration.sendToAiriWithVision(result)
    }
  }

  async function enableAutoCapture(interval = 30000) {
    try {
      await setAutoCapture({ enabled: true, interval })
      autoCaptureEnabled.value = true
    }
    catch (e) {
      visionCapture.error.value = e instanceof Error ? e.message : 'Failed to enable auto capture'
    }
  }

  async function disableAutoCapture() {
    try {
      await setAutoCapture({ enabled: false })
      autoCaptureEnabled.value = false
    }
    catch (e) {
      visionCapture.error.value = e instanceof Error ? e.message : 'Failed to disable auto capture'
    }
  }

  function setAnalysisResult(result: AnalysisResult | null) {
    visionAnalysis.setAnalysisResult(result)
  }

  function clearError() {
    visionCapture.clearError()
  }

  function clearScreenshot() {
    visionCapture.clearScreenshot()
    visionAnalysis.setAnalysisResult(null)
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

export type { AnalysisResult, Screenshot }
