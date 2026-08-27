import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import SpeechPlayground from './speech-playground.vue'

function createEnglishI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

async function renderPlayground(ssmlSupported?: boolean) {
  return render(SpeechPlayground, {
    props: {
      availableVoices: [{
        id: 'voice-1',
        name: 'Voice 1',
        provider: 'test-provider',
        languages: [],
      }],
      generateSpeech: vi.fn(async () => new ArrayBuffer(0)),
      apiKeyConfigured: true,
      fixedVoice: 'voice-1',
      ssmlSupported,
    },
    global: {
      plugins: [createEnglishI18n()],
    },
  })
}

describe('speech playground SSML capability', () => {
  it('shows the custom SSML control by default', async () => {
    const screen = await renderPlayground()

    expect(screen.container.textContent).toContain('Use Custom SSML')
  })

  it('hides the custom SSML control for providers that do not support it', async () => {
    // ROOT CAUSE:
    //
    // The shared playground always rendered its raw SSML control. Providers
    // such as Doubao ignored the SSML flag and sent the XML as ordinary text,
    // so a preview could speak markup or fail upstream.
    //
    // We fixed this by making SSML an explicit provider capability and by
    // keeping unsupported playgrounds on the plain-text input path.
    const screen = await renderPlayground(false)

    expect(screen.container.textContent).not.toContain('Use Custom SSML')
    expect(screen.container.querySelector('textarea')?.getAttribute('placeholder')).toContain('Enter text to test the voice')
  })
})
