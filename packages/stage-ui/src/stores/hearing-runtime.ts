import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Foreground runtime state. Persisted microphone preferences remain in audio-device. */
export const useHearingRuntimeStore = defineStore('hearing-runtime', () => {
  const ownerId = shallowRef<string>()
  const preparation = shallowRef<'idle' | 'preparing' | 'ready' | 'unconfigured' | 'error'>('idle')
  const preparationError = shallowRef<string>()
  return { ownerId, preparation, preparationError }
})
