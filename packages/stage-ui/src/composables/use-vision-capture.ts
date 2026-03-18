import type { ComputedRef } from 'vue'

import type { Screenshot, VisionScreenshotPayload } from '../types'

import { computed, ref } from 'vue'

export interface UseVisionCaptureOptions {
  captureScreenshot: () => Promise<VisionScreenshotPayload | undefined>
  cooldownDuration?: number
}

export interface UseVisionCaptureReturn {
  screenshot: ReturnType<typeof ref<Screenshot | null>>
  isCapturing: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<string | null>>
  cooldownRemaining: ReturnType<typeof ref<number>>
  canCapture: ComputedRef<boolean>
  captureScreen: () => Promise<void>
  clearError: () => void
  clearScreenshot: () => void
}

export function useVisionCapture(options: UseVisionCaptureOptions): UseVisionCaptureReturn {
  const { captureScreenshot, cooldownDuration = 5000 } = options

  const screenshot = ref<Screenshot | null>(null)
  const isCapturing = ref(false)
  const error = ref<string | null>(null)
  const cooldownRemaining = ref(0)

  let cooldownTimer: ReturnType<typeof setInterval> | null = null

  const canCapture = computed(() => !isCapturing.value && cooldownRemaining.value === 0)

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

  async function captureScreen() {
    if (!canCapture.value) {
      return
    }

    isCapturing.value = true
    error.value = null

    try {
      const result = await captureScreenshot()
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

  function clearError() {
    error.value = null
  }

  function clearScreenshot() {
    screenshot.value = null
  }

  return {
    screenshot,
    isCapturing,
    error,
    cooldownRemaining,
    canCapture,
    captureScreen,
    clearError,
    clearScreenshot,
  }
}
