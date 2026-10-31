import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import VoiceInputButton from './voice-input-button.vue'

import { getSpeechBusContext, voiceRequestSnapshot, voiceSnapshotChanged } from '../../../../services/speech/bus'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

// A long microphone name made the menu wider than a small chat window, and the window cut off its switches.
it('keeps the voice menu inside a narrow window when the microphone has a long name', async () => {
  await page.viewport(400, 700)
  const longName = 'Default - Microphone Array (Intel® Smart Sound Technology for Digital Microphones)'
  const spy = vi.spyOn(navigator.mediaDevices, 'enumerateDevices').mockResolvedValue([
    { deviceId: 'default', groupId: 'g', kind: 'audioinput', label: longName, toJSON: () => ({}) },
  ])
  cleanups.push(() => spy.mockRestore())
  localStorage.setItem('settings/audio/input', 'default')
  // The button works only with a connected voice host.
  const context = getSpeechBusContext()
  cleanups.push(context.on(voiceRequestSnapshot, () => context.emit(voiceSnapshotChanged, { connected: true, drafts: [] })))

  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const status = document.body.appendChild(document.createElement('div'))
  const attachment = document.body.appendChild(document.createElement('div'))
  cleanups.push(() => status.remove(), () => attachment.remove())
  // The composer keeps the microphone at the right edge, as the chat window does.
  const component = defineComponent({ setup() {
    return () => h('div', { style: 'display: flex; justify-content: flex-end; width: 100vw; margin-top: 600px' }, [
      h(VoiceInputButton, { modelValue: '', sessionId: 'alice', statusElement: status, attachmentElement: attachment }),
    ])
  } })
  const screen = await render(component, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] },
  })
  cleanups.push(() => screen.unmount())

  await screen.getByTestId('voice-input-button').click({ button: 'right' })
  await expect.element(screen.getByTestId('voice-menu-device')).toHaveTextContent(longName)

  const menu = screen.getByTestId('voice-menu-device').element().closest('[role="menu"]')!
  await expect.poll(() => menu.getBoundingClientRect().height).toBeGreaterThan(100)
  await Promise.all(menu.getAnimations({ subtree: true }).map(animation => animation.finished))
  expect(menu.getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
  expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
  expect(screen.getByTestId('voice-menu-auto-send').element().getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
})
