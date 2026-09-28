import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Global speech fallbacks share one leader-owned persistence boundary, not character selection. */
export const useSpeechSettingsStore = defineStore('speech-settings', () => {
  const pitch = shallowRef(typeof localStorage === 'undefined' ? 0 : Number(localStorage.getItem('settings/speech/pitch') ?? 0))
  const ssmlEnabled = shallowRef(typeof localStorage !== 'undefined' && localStorage.getItem('settings/speech/ssml-enabled') === 'true')

  async function setPitch(value: number) {
    if (pitch.value === value)
      return
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('settings/speech/pitch', String(value))
    pitch.value = value
  }

  async function setSsmlEnabled(value: boolean) {
    if (ssmlEnabled.value === value)
      return
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('settings/speech/ssml-enabled', String(value))
    ssmlEnabled.value = value
  }

  async function resetState() {
    await setPitch(0)
    await setSsmlEnabled(false)
  }

  return { pitch, ssmlEnabled, setPitch, setSsmlEnabled, resetState }
}, {
  synced: {
    state: true,
    actions: ['setPitch', 'setSsmlEnabled', 'resetState'],
  },
})
