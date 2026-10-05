import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import ChatDanmakuFeedMenu from './chat-danmaku-feed-menu.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

async function renderMenu() {
  const screen = await render(ChatDanmakuFeedMenu, {
    global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
  })
  onTestFinished(() => screen.unmount())
  return page.getByRole('button', { name: 'tamagotchi.stage.chat-window.danmaku-feed.title' })
}

describe('chatDanmakuFeedMenu', () => {
  beforeEach(() => {
    localStorage.removeItem('chat-window/danmaku/hide-read-messages')
  })

  it('rests the trigger in the secondary icon color of the title bar', async () => {
    // ROOT CAUSE:
    //
    // A review moved the trigger to GhostButton, whose own text color is
    // darker. The hourglass then stood out from its gray neighbors.
    //
    // The trigger is a plain button that owns its color, like the others.
    const trigger = await renderMenu()
    const reference = document.createElement('div')
    reference.className = 'text-neutral-400'
    document.body.append(reference)
    onTestFinished(() => reference.remove())

    expect(getComputedStyle(trigger.element()).color).toBe(getComputedStyle(reference).color)
  })

  it('shows the timing sliders only while read messages hide', async () => {
    const trigger = await renderMenu()
    await trigger.click()
    await expect.element(page.getByRole('slider').first()).toBeInTheDocument()
    expect(page.getByRole('slider').all()).toHaveLength(2)

    await page.getByRole('switch').click()

    expect(page.getByRole('slider').all()).toHaveLength(0)
  })
})
