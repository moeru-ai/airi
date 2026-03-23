import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { shallowRef, toRef } from 'vue'

// Detect iOS device
function isIOS(): boolean {
  return typeof navigator !== 'undefined'
    && /iPad|iPhone|iPod/.test(navigator.userAgent)
    && !(window as unknown as { MSStream?: unknown }).MSStream
}

// Configure iOS Audio Session to bypass Silent mode
async function configureIOSAudioSession(audioContext: AudioContext): Promise<void> {
  // On iOS 15+, we can configure the audio session
  const audioSession = (audioContext as unknown as { audioSession?: { configure: (options: { category: string, mode?: string, options?: string[] }) => Promise<void> } }).audioSession
  if (audioSession) {
    try {
      // Use playback category to bypass Silent mode
      await audioSession.configure({
        category: 'playback',
        mode: 'default',
        options: ['allowAirPlay', 'allowBluetooth', 'allowBluetoothA2DP'],
      })
    }
    catch (error) {
      console.warn('Failed to configure iOS audio session:', error)
    }
  }
}

export function useAudioContextFromStream(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const mediaRef = toRef(media)
  const audioContext = shallowRef<AudioContext>()

  async function initialize() {
    await until(mediaRef).toBeTruthy()

    if (audioContext.value) {
      return audioContext.value
    }

    // Create AudioContext with iOS-compatible options
    const isIos = isIOS()
    const options: AudioContextOptions = {}

    if (isIos) {
      // On iOS, try to configure for playback that bypasses Silent mode
      // This is done through the audioSession property (iOS 15+)
    }

    audioContext.value = new AudioContext(options)

    // Configure iOS audio session if available
    if (isIos) {
      await configureIOSAudioSession(audioContext.value)
    }

    await audioContext.value.resume()

    return audioContext.value
  }

  function pause() {
    if (audioContext.value && audioContext.value.state === 'running') {
      audioContext.value.suspend()
    }
  }

  function resume() {
    if (audioContext.value && audioContext.value.state === 'suspended') {
      audioContext.value.resume()
    }
  }

  function dispose() {
    if (audioContext.value) {
      audioContext.value.close()
      audioContext.value = undefined
    }
  }

  return {
    audioContext,

    initialize,
    pause,
    resume,
    dispose,
  }
}
