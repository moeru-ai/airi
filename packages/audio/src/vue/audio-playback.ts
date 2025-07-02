import type { MaybeRefOrGetter } from 'vue'

import { computed, onUnmounted, ref, toRef, watch } from 'vue'

import { createAudioGainNode, createAudioSource, getAudioContext, getCurrentTime, initializeAudioContext, removeAudioGainNode, removeAudioSource } from '../audio-context'

export function useAudioPlayback(src: MaybeRefOrGetter<MediaStream | undefined>) {
  const audioContext = getAudioContext()
  const sourceStream = toRef(src)

  const isEnabled = ref(false)
  const volume = ref(50) // 0-100
  const error = ref('')

  // Audio nodes for playback
  const source = ref<MediaStreamAudioSourceNode>()
  const gainNode = ref<GainNode>()

  const actualVolume = computed(() => volume.value / 100)

  async function setupPlayback() {
    if (!sourceStream.value || !isEnabled.value)
      return

    try {
      error.value = ''

      // Ensure audio context is ready
      await initializeAudioContext()

      // Clean up existing playback
      cleanupPlayback()

      // Create new nodes
      source.value = createAudioSource(sourceStream.value)
      gainNode.value = createAudioGainNode(actualVolume.value)

      // Connect: source -> gain -> destination
      source.value.connect(gainNode.value)
      gainNode.value.connect(audioContext!.destination)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Failed to setup audio playback:', err)
    }
  }

  function cleanupPlayback() {
    if (source.value) {
      removeAudioSource(source.value)
      source.value = undefined
    }

    if (gainNode.value) {
      removeAudioGainNode(gainNode.value)
      gainNode.value = undefined
    }
  }

  // Watch for changes
  watch([sourceStream, isEnabled], async () => {
    if (isEnabled.value && sourceStream.value) {
      await setupPlayback()
    }
    else {
      cleanupPlayback()
    }
  })

  watch(actualVolume, (newVolume) => {
    if (gainNode.value) {
      // Smooth volume changes to prevent clicks
      const currentTime = getCurrentTime()
      gainNode.value.gain.cancelScheduledValues(currentTime)
      gainNode.value.gain.setValueAtTime(gainNode.value.gain.value, currentTime)
      gainNode.value.gain.linearRampToValueAtTime(newVolume, currentTime + 0.1)
    }
  })

  onUnmounted(() => {
    cleanupPlayback()
  })

  return {
    // State
    isEnabled,
    volume,
    error,

    // Manual control
    setupPlayback,
    cleanupPlayback,
  }
}
