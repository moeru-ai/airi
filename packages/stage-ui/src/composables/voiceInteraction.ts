import type { RealTimeVADOptions } from '@ricky0123/vad-web'
import type { MaybeRef } from '@vueuse/shared'

import { merge } from '@moeru/std'
import { getDefaultRealTimeVADOptions, MicVAD } from '@ricky0123/vad-web'
import { useLocalStorage, usePermission } from '@vueuse/core'
import { tryOnMounted } from '@vueuse/shared'
import { computed, onUnmounted, ref, toRef, unref, watch } from 'vue'

export interface VoiceInteractionOptions {
  auto?: boolean
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
  onVoiceActivityDetected?: (probability: number) => void
  onTranscriptionResult?: (text: string) => void
  // VAD Options
  preSpeechPadFrames?: number
  positiveSpeechThreshold?: number
  negativeSpeechThreshold?: number
  minSpeechFrames?: number
}

export function useVoiceInteraction(
  deviceId: MaybeRef<ConstrainDOMString | undefined>,
  options: VoiceInteractionOptions = {},
) {
  // Настройки чувствительности, сохраняемые локально
  const microphoneSensitivity = useLocalStorage('voice-interaction/microphone-sensitivity', 0.5)
  const speechThreshold = useLocalStorage('voice-interaction/speech-threshold', 0.5)
  const noiseReduction = useLocalStorage('voice-interaction/noise-reduction', true)

  // Состояния
  const isListening = ref(false)
  const isRecording = ref(false)
  const micVad = ref<MicVAD>()
  const microphoneAccess = usePermission('microphone')
  const audioLevel = ref(0)
  const speechProbability = ref(0)
  const isVoiceActive = ref(false)

  // Звуковой контекст для анализа уровня звука
  const audioContext = ref<AudioContext>()
  const analyser = ref<AnalyserNode>()
  const dataArray = ref<Uint8Array>()
  const animationFrame = ref<number>()

  // Вычисляемые опции VAD с учетом пользовательских настроек
  const vadOptions = computed(() => {
    const baseOptions = merge<Omit<RealTimeVADOptions, 'stream'> & { auto?: boolean }, VoiceInteractionOptions>({
      ...getDefaultRealTimeVADOptions('v5'),
      preSpeechPadFrames: 30,
      positiveSpeechThreshold: speechThreshold.value,
      negativeSpeechThreshold: speechThreshold.value - 0.15,
      minSpeechFrames: Math.max(5, Math.floor(30 * microphoneSensitivity.value)),
      auto: true,
    }, options)

    return {
      ...baseOptions,
      onSpeechStart: () => {
        console.warn('Speech started')
        isVoiceActive.value = true
        isRecording.value = true
        options.onSpeechStart?.()
      },
      onSpeechEnd: () => {
        console.warn('Speech ended')
        isVoiceActive.value = false
        isRecording.value = false
        options.onSpeechEnd?.()
      },
      onVADMisfire: () => {
        console.warn('VAD misfire detected')
        isVoiceActive.value = false
        isRecording.value = false
      },
    }
  })

  // Инициализация аудио анализатора для визуализации уровня
  async function initializeAudioAnalyser(stream: MediaStream) {
    try {
      audioContext.value = new AudioContext()
      analyser.value = audioContext.value.createAnalyser()
      analyser.value.fftSize = 256

      const source = audioContext.value.createMediaStreamSource(stream)
      source.connect(analyser.value)

      const bufferLength = analyser.value.frequencyBinCount
      dataArray.value = new Uint8Array(bufferLength)

      startAudioLevelMonitoring()
    }
    catch (error) {
      console.error('Failed to initialize audio analyser:', error)
    }
  }

  // Мониторинг уровня звука для визуализации
  function startAudioLevelMonitoring() {
    if (!analyser.value || !dataArray.value)
      return

    function updateAudioLevel() {
      if (!analyser.value || !dataArray.value)
        return

      analyser.value.getByteFrequencyData(dataArray.value)

      // Вычисляем средний уровень звука
      let sum = 0
      for (let i = 0; i < dataArray.value.length; i++) {
        sum += dataArray.value[i]
      }
      const average = sum / dataArray.value.length
      audioLevel.value = average / 255 // Нормализуем от 0 до 1

      animationFrame.value = requestAnimationFrame(updateAudioLevel)
    }

    updateAudioLevel()
  }

  function stopAudioLevelMonitoring() {
    if (animationFrame.value) {
      cancelAnimationFrame(animationFrame.value)
      animationFrame.value = undefined
    }
  }

  async function update() {
    if (micVad.value) {
      micVad.value.destroy()
      micVad.value = undefined
      console.warn('Existing MicVAD destroyed')
    }

    stopAudioLevelMonitoring()

    if (!microphoneAccess.value)
      return

    const id = unref(deviceId)
    if (!id)
      return

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: id,
          echoCancellation: true,
          noiseSuppression: noiseReduction.value,
          autoGainControl: true,
        },
      })

      // Инициализируем анализатор звука
      await initializeAudioAnalyser(media)

      const opts = vadOptions.value
      micVad.value = await MicVAD.new({
        ...opts,
        stream: media,
      })

      if (opts.auto) {
        micVad.value.start()
        isListening.value = true
      }

      console.warn('Voice interaction initialized with sensitivity:', microphoneSensitivity.value)
    }
    catch (error) {
      console.error('Failed to initialize voice interaction:', error)
    }
  }

  // Функции управления
  function start() {
    if (micVad.value && !isListening.value) {
      micVad.value.start()
      isListening.value = true
      console.warn('Voice interaction started')
    }
  }

  function stop() {
    if (micVad.value && isListening.value) {
      micVad.value.pause()
      isListening.value = false
      isVoiceActive.value = false
      isRecording.value = false
      console.warn('Voice interaction stopped')
    }
  }

  function destroy() {
    stopAudioLevelMonitoring()
    if (micVad.value) {
      micVad.value.destroy()
      micVad.value = undefined
    }
    if (audioContext.value) {
      audioContext.value.close()
      audioContext.value = undefined
    }
    isListening.value = false
    isVoiceActive.value = false
    isRecording.value = false
  }

  // Функции для настройки чувствительности
  function setSensitivity(value: number) {
    microphoneSensitivity.value = Math.max(0, Math.min(1, value))
    // Перезапускаем VAD с новыми настройками
    if (isListening.value) {
      update()
    }
  }

  function setSpeechThreshold(value: number) {
    speechThreshold.value = Math.max(0, Math.min(1, value))
    if (isListening.value) {
      update()
    }
  }

  function setNoiseReduction(enabled: boolean) {
    noiseReduction.value = enabled
    if (isListening.value) {
      update()
    }
  }

  // Watchers
  watch(microphoneAccess, update, { immediate: true })
  watch(toRef(deviceId), update, { immediate: true })

  // Реактивное обновление при изменении настроек чувствительности
  watch([microphoneSensitivity, speechThreshold], () => {
    if (isListening.value) {
      // Небольшая задержка для предотвращения частых перезапусков
      setTimeout(update, 100)
    }
  })

  tryOnMounted(update)
  onUnmounted(destroy)

  return {
    // Состояния
    isListening: readonly(isListening),
    isRecording: readonly(isRecording),
    isVoiceActive: readonly(isVoiceActive),
    audioLevel: readonly(audioLevel),
    speechProbability: readonly(speechProbability),
    microphoneAccess: readonly(microphoneAccess),

    // Настройки
    microphoneSensitivity,
    speechThreshold,
    noiseReduction,

    // Функции управления
    start,
    stop,
    destroy,
    setSensitivity,
    setSpeechThreshold,
    setNoiseReduction,
  }
}

// Утилитарная функция для создания readonly ref
function readonly<T>(ref: import('vue').Ref<T>) {
  return computed(() => ref.value)
}
