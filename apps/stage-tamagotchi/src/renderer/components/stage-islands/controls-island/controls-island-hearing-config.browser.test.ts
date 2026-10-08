import en from '@proj-airi/i18n/locales/en'

import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { createPinia, disposePinia } from 'pinia'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ControlsIslandHearingConfig from './controls-island-hearing-config.vue'

// ROOT CAUSE:
// The hearing controls started an analyzer without connecting the microphone stream.
// Connecting the active stream restores volume updates without owning its tracks.
it('updates microphone volume from the active stream without replacing its tracks', async () => {
  localStorage.setItem('settings/audio/input/enabled', 'true')
  const pinia = createPinia()
  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const destination = context.createMediaStreamDestination()
  oscillator.connect(gain).connect(destination)
  gain.gain.value = 0.2
  oscillator.start()

  let volume!: ReturnType<typeof useAudioAnalyzer>['volumeLevel']
  const started = ref(false)
  const screen = render(defineComponent({
    setup() {
      const devices = useSettingsAudioDevice()
      devices.stream = destination.stream
      volume = useAudioAnalyzer().volumeLevel
      return () => h('div', [
        h('button', {
          onClick: () => {
            void context.resume()
            started.value = true
          },
        }, 'Start test audio'),
        started.value ? h(ControlsIslandHearingConfig) : undefined,
      ])
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })

  try {
    await page.getByRole('button', { name: 'Start test audio' }).click()
    await expect.poll(() => volume.value).toBeGreaterThan(5)
    gain.gain.value = 0
    await expect.poll(() => volume.value).toBeLessThan(1)
    gain.gain.value = 0.2
    await expect.poll(() => volume.value).toBeGreaterThan(5)
    expect(destination.stream.getAudioTracks()[0].readyState).toBe('live')
  }
  finally {
    await screen.unmount()
    oscillator.stop()
    destination.stream.getTracks().forEach(track => track.stop())
    await context.close()
    disposePinia(pinia)
    localStorage.removeItem('settings/audio/input/enabled')
  }
})
