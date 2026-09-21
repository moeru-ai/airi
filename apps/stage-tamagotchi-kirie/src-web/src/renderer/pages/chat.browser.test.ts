import { ScrollableArea } from '@proj-airi/ui'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'

import ChatViewportLayout from '../components/chat-viewport-layout.vue'
import ChatPageShell from './chat-page-shell.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

describe('mobile chat viewport resizing', () => {
  // ROOT CAUSE:
  //
  // The chat shell filled a fixed-height host surface when the visible viewport shrank.
  // The composer remained below the visible area because the shell did not consume viewport geometry.
  // This browser test changes the real viewport without replacing VisualViewport or keyboard APIs.
  // Android IME behavior still requires a device test because a desktop resize is not a software keyboard.
  it('keeps the focused composer visible when the viewport shrinks and restores its height', async () => {
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    onTestFinished(() => page.viewport(originalWidth, originalHeight))
    await page.viewport(390, 844)

    const TestHost = defineComponent({
      components: { ChatPageShell, ChatViewportLayout },
      template: `
        <div style="position: fixed; top: 0; left: 0; height: 844px; width: 390px">
          <ChatPageShell :adaptive-input="true">
            <ChatViewportLayout>
              <template #history><div>Chat history</div></template>
              <template #composer>
                <textarea aria-label="Message" style="display: block; height: 80px; width: 100%" />
              </template>
            </ChatViewportLayout>
          </ChatPageShell>
        </div>
      `,
    })
    const screen = await render(TestHost)
    const shell = screen.getByTestId('desktop-chat-page-shell').element() as HTMLElement
    const composer = screen.getByTestId('chat-composer-layer').element() as HTMLElement
    const input = screen.getByRole('textbox', { name: 'Message' })
    await userEvent.fill(input, 'Keep this draft')

    await page.viewport(390, 544)

    await vi.waitFor(() => {
      expect(window.visualViewport!.height).toBeLessThan(844)
      expect(composer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        window.visualViewport!.height + window.visualViewport!.offsetTop,
      )
      expect(shell.getBoundingClientRect().height).toBeLessThan(844)
    })
    await expect.element(input).toHaveFocus()
    await expect.element(input).toHaveValue('Keep this draft')

    await page.viewport(390, 844)

    await vi.waitFor(() => {
      expect(shell.getBoundingClientRect().height).toBe(844)
      expect(composer.getBoundingClientRect().bottom).toBeGreaterThan(544)
      expect(composer.getBoundingClientRect().bottom).toBeLessThanOrEqual(844)
    })
    await expect.element(input).toHaveFocus()
    await expect.element(input).toHaveValue('Keep this draft')
  })
})

describe('desktop chat page scrolling', () => {
  it('leaves scrolling to the rendered chat history viewport', async () => {
    const TestHost = defineComponent({
      components: { ChatPageShell, ScrollableArea },
      template: `
        <ChatPageShell style="height: 160px; width: 240px">
          <ScrollableArea data-testid="history-area" style="height: 100%">
            <div style="height: 320px">Long chat history</div>
          </ScrollableArea>
        </ChatPageShell>
      `,
    })
    const screen = await render(TestHost)
    const shell = screen.getByTestId('desktop-chat-page-shell').element() as HTMLElement
    const viewport = screen.container.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')

    expect(getComputedStyle(shell).overflowY).toBe('hidden')
    expect(getComputedStyle(viewport!).overflowY).toBe('scroll')
    expect(viewport!.scrollHeight).toBeGreaterThan(viewport!.clientHeight)

    const verticalScrollOwners = [shell, viewport].filter((element) => {
      if (!element)
        return false

      return ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
        && element.scrollHeight > element.clientHeight
    })
    expect(verticalScrollOwners).toEqual([viewport])
  })
})
