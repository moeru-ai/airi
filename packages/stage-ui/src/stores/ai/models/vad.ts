import type { MaybeRefOrGetter } from 'vue'

// 顺手重构：引入了规范要求的 errorMessageFrom
import { errorMessageFrom, merge } from '@moeru/std'
import { ref, toRef, watch } from 'vue'

import { createVAD, createVADStates } from '../../../workers/vad'

interface UseVADOptions {
  threshold?: MaybeRefOrGetter<number>
  // 核心改动 1：允许外部传入静音打断时长
  minSilenceDurationMs?: MaybeRefOrGetter<number>

  onSpeechStart?: () => void
  onSpeechEnd?: () => void
}

export function useVAD(workerUrl: string, options?: UseVADOptions) {
  const defaultOptions: UseVADOptions = {
    threshold: ref(0.6),
    // 核心改动 2：设定默认值为符合人类正常说话换气的 1200ms
    minSilenceDurationMs: ref(1200),
  }

  options = merge(defaultOptions, options)

  const vad = ref<Awaited<ReturnType<typeof createVAD>>>()
  const manager = ref<ReturnType<typeof createVADStates>>()
  const inferenceError = ref<string>()
  const maxIsSpeechHistory = 50

  const isSpeech = ref(false)
  const isSpeechProb = ref(0)
  const isSpeechHistory = ref<number[]>([])

  const loaded = ref(false)
  const loading = ref(false)

  const threshold = toRef(options.threshold)
  // 核心改动 3：让代码“监听”这个新参数
  const minSilenceDurationMs = toRef(options.minSilenceDurationMs)

  async function init() {
    if (loaded.value || loading.value || manager.value)
      return

    loading.value = true
    inferenceError.value = ''

    try {
      vad.value = await createVAD({
        sampleRate: 16000,
        speechThreshold: threshold.value,
        exitThreshold: (threshold.value ?? 0.6) * 0.3,
        // 核心改动 4：把写死的 400 替换成外部传进来的变量
        minSilenceDurationMs: minSilenceDurationMs.value ?? 1200,
      })

      // Set up event handlers
      vad.value.on('speech-start', () => {
        isSpeech.value = true
        options?.onSpeechStart?.()
      })

      vad.value.on('speech-end', () => {
        isSpeech.value = false
        options?.onSpeechEnd?.()
      })

      vad.value.on('debug', ({ data }) => {
        if (data?.probability !== undefined) {
          isSpeechProb.value = data.probability

          // Update VAD history for visualization
          isSpeechHistory.value.push(data.probability)
          if (isSpeechHistory.value.length > maxIsSpeechHistory) {
            isSpeechHistory.value.shift()
          }
        }
      })

      vad.value.on('status', ({ type, message }) => {
        if (type === 'error') {
          inferenceError.value = message
        }
      })

      // Create and initialize audio manager
      const m = createVADStates(vad.value, workerUrl, {
        minChunkSize: 512,
        // NOTICE: VAD will have it's own audio context since
        // it needs special sample rate and latency settings
        audioContextOptions: {
          sampleRate: 16000,
          latencyHint: 'interactive',
        },
      })

      await m.initialize()
      manager.value = m
      loaded.value = true
    }
    catch (error) {
      // 顺手重构：使用官方要求的 errorMessageFrom 替代旧写法，并给一个兜底文本
      inferenceError.value = errorMessageFrom(error) ?? 'Failed to initialize VAD'
    }
    finally {
      loading.value = false
    }
  }

  async function start(stream: MediaStream) {
    if (manager.value)
      await manager.value.start(stream)
  }

  function dispose() {
    manager.value?.stop()
    manager.value?.dispose()
    manager.value = undefined

    isSpeech.value = false
    isSpeechProb.value = 0
    isSpeechHistory.value = []

    loaded.value = false
    loading.value = false
  }

  watch(threshold, (newVal) => {
    if (vad.value && newVal) {
      vad.value.updateConfig({ speechThreshold: newVal, exitThreshold: newVal * 0.3 })
    }
  })

  // 核心改动 5：如果 UI 界面上的滑块被拖动，立刻通知底层的 VAD 刷新参数
  watch(minSilenceDurationMs, (newVal) => {
    if (vad.value && newVal) {
      vad.value.updateConfig({ minSilenceDurationMs: newVal })
    }
  })

  return {
    isSpeech,
    isSpeechProb,
    isSpeechHistory,
    loaded,
    loading,
    inferenceError,
    threshold,
    // 核心改动 6：把这个变量交出去，给 UI 界面使用
    minSilenceDurationMs,

    init,
    start,
    dispose,
  }
}
