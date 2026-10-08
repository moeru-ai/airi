import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import VoiceMessagePlayer from './voice-message-player.vue'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

/** A 16 kHz mono 16-bit WAV: silence, then a tone for the second half. */
function wavOf(seconds: number) {
  const rate = 16000
  const frames = rate * seconds
  const view = new DataView(new ArrayBuffer(44 + frames * 2))
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + frames * 2, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, frames * 2, true)
  for (let frame = frames / 2; frame < frames; frame++)
    view.setInt16(44 + frame * 2, Math.round(Math.sin(frame / 8) * 12000), true)
  return new Blob([view.buffer], { type: 'audio/wav' })
}

async function mountPlayer(seconds: number) {
  const screen = await render(VoiceMessagePlayer, {
    props: { audio: wavOf(seconds) },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] },
  })
  cleanups.push(() => screen.unmount())
  const waveform = screen.getByRole('slider')
  await expect.element(waveform).toHaveAttribute('aria-valuemax', String(seconds))
  return { screen, waveform }
}

describe('voiceMessagePlayer', () => {
  it('sizes the waveform by the recording length and shows no duration text', async () => {
    const { screen, waveform } = await mountPlayer(4)

    expect(waveform.element().getBoundingClientRect().width).toBe(112)
    expect(screen.container.textContent?.trim()).toBe('')
  })

  it('seeks to the pointer position and by keyboard', async () => {
    const { waveform } = await mountPlayer(4)

    await userEvent.click(waveform, { position: { x: 84, y: 12 } })
    await expect.element(waveform).toHaveAttribute('aria-valuenow', '3')

    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(waveform).toHaveAttribute('aria-valuenow', '2')
    await userEvent.keyboard('{End}')
    await expect.element(waveform).toHaveAttribute('aria-valuenow', '4')
  })
})
