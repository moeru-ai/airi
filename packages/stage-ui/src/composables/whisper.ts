import type { WhisperEvent } from '../libs/inference/adapters/whisper'
import type { ProgressPayload } from '../libs/inference/protocol'

import { merge } from '@moeru/std'
import { onUnmounted, ref } from 'vue'

import { createWhisperAdapter } from '../libs/inference/adapters/whisper'

export interface UseWhisperOptions {
  onLoading: (message: string) => void
  onProgress: (payload: ProgressPayload) => void
  onReady: () => void
  onStart: () => void
  onUpdate: (tps: number) => void
  onComplete: (output: string) => void
  onError: (message: string) => void
}

export function useWhisper(url: string, options?: Partial<UseWhisperOptions>) {
  const opts = merge<UseWhisperOptions>({
    onLoading: () => {},
    onProgress: () => {},
    onReady: () => {},
    onStart: () => {},
    onUpdate: () => {},
    onComplete: () => {},
    onError: () => {},
  }, options)

  const adapter = createWhisperAdapter(url)

  const status = ref<'loading' | 'ready' | null>(null)
  const loadingMessage = ref('')
  const loadingProgress = ref<ProgressPayload[]>([])
  const transcribing = ref(false)
  const tps = ref<number>(0)
  const result = ref('')

  // Subscribe to unified protocol events for streaming UI updates
  adapter.onMessage((e: WhisperEvent) => {
    switch (e.type) {
      case 'progress': {
        const payload = e.payload
        if (payload.phase === 'download' || payload.phase === 'compile' || payload.phase === 'warmup') {
          status.value = 'loading'
          loadingMessage.value = payload.message ?? ''
          opts.onLoading?.(payload.message ?? '')

          if (payload.phase === 'download' && payload.file) {
            // Update or add file progress
            const existing = loadingProgress.value.findIndex(p => p.file === payload.file)
            if (existing >= 0) {
              loadingProgress.value[existing] = payload
            }
            else {
              loadingProgress.value.push(payload)
            }
          }
          opts.onProgress?.(payload)
        }
        else if (payload.phase === 'inference') {
          // Streaming transcription updates
          const extra = payload as any
          if (extra.tps != null) {
            tps.value = extra.tps
            opts.onUpdate?.(extra.tps)
          }
        }
        break
      }

      case 'model-ready':
        status.value = 'ready'
        loadingProgress.value = []
        opts.onReady?.()
        break

      case 'inference-result':
        transcribing.value = false
        result.value = e.output?.text?.[0] ?? ''
        // eslint-disable-next-line no-console
        console.debug('Whisper result:', result.value)
        opts.onComplete?.(result.value)
        break

      case 'error':
        opts.onError?.(e.payload.message)
        break
    }
  })

  onUnmounted(() => {
    adapter.terminate()
  })

  return {
    transcribe: (input: { audio?: string, audioFloat32?: Float32Array, language: string }) => {
      transcribing.value = true
      opts.onStart?.()
      adapter.transcribe({
        audio: input.audio,
        audioFloat32: input.audioFloat32,
        language: input.language,
      }).catch((err) => {
        console.error('Whisper transcription error:', err)
        transcribing.value = false
        opts.onError?.(err instanceof Error ? err.message : String(err))
      })
    },
    status,
    loadingMessage,
    loadingProgress,
    transcribing,
    tps,
    result,
    load: () => adapter.load(),
    terminate: () => adapter.terminate(),
  }
}
