import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ComposerAddMenu from './composer-add-menu.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

async function openMenu(props: { inCall?: boolean, recording?: boolean }) {
  const screen = await render(ComposerAddMenu, {
    props,
    global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] },
  })
  cleanups.push(() => screen.unmount())
  await screen.getByTestId('composer-add-button').click()
  return screen
}

describe('composerAddMenu', () => {
  it('offers images and a voice call', async () => {
    const screen = await openMenu({})

    await expect.element(screen.getByTestId('composer-add-images')).toBeVisible()
    await expect.element(screen.getByTestId('composer-add-call')).not.toHaveAttribute('data-disabled')
  })

  // https://github.com/moeru-ai/airi/pull/3223#discussion_r4410050200
  // A call removes the composer microphone, and its cleanup discarded the open recording.
  it('turns off the call while a composer recording is open', async () => {
    const screen = await openMenu({ recording: true })

    await expect.element(screen.getByTestId('composer-add-call')).toHaveAttribute('data-disabled')
  })

  it('turns off the call while a call runs', async () => {
    const screen = await openMenu({ inCall: true })

    await expect.element(screen.getByTestId('composer-add-call')).toHaveAttribute('data-disabled')
  })
})
