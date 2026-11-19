import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import SendButton from './send-button.vue'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

async function mountSendButton() {
  const sendMode = ref<'enter' | 'ctrl-enter' | 'double-enter'>('enter')
  const sent: unknown[] = []
  const component = defineComponent({ setup() {
    return () => h(SendButton, {
      'sendMode': sendMode.value,
      'onUpdate:sendMode': (value: 'enter' | 'ctrl-enter' | 'double-enter') => sendMode.value = value,
      'onSend': () => sent.push(true),
    })
  } })
  const screen = await render(component, { global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
  cleanups.push(() => screen.unmount())
  return { screen, sendMode, sent }
}

describe('chatSendButton', () => {
  it('sends on click without opening the send key menu', async () => {
    const { screen, sent } = await mountSendButton()

    await screen.getByTestId('chat-send-button').click()

    expect(sent).toHaveLength(1)
    expect(page.getByRole('menu').query()).toBeNull()
  })

  it('chooses the send key from the menu that a right-click opens', async () => {
    const { screen, sendMode, sent } = await mountSendButton()

    await userEvent.click(screen.getByTestId('chat-send-button'), { button: 'right' })
    await page.getByRole('menuitemradio', { name: 'stage.send-mode.ctrl-enter' }).click()

    expect(sendMode.value).toBe('ctrl-enter')
    expect(sent).toEqual([])
  })
})
