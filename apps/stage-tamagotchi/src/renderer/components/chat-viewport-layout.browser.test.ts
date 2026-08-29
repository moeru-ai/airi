import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'

import ChatViewportLayout from './chat-viewport-layout.vue'

describe('desktop chat viewport layout', () => {
  // ROOT CAUSE:
  //
  // Padding around the whole interactive area also inset the native history
  // scrollbar, while placing the composer after history shortened its track.
  // History needs a full-size layer and the composer needs a fixed sibling layer.
  it('keeps an edge-to-edge history viewport behind a fixed composer', async () => {
    const TestHost = defineComponent({
      components: { ChatViewportLayout },
      template: `
        <ChatViewportLayout style="height: 320px; width: 240px">
          <template #history>
            <div class="chat-history-list" style="height: 100%; overflow-y: auto; border-radius: 12px; scrollbar-width: none">
              <div style="height: 640px">Long chat history</div>
            </div>
            <div
              class="scrollable-area-scrollbar--vertical"
              data-state="visible"
              style="position: absolute; top: 0; right: 0; bottom: 0; width: 10px"
            />
          </template>
          <template #composer>
            <div style="height: 80px">Fixed composer</div>
          </template>
        </ChatViewportLayout>
      `,
    })

    const screen = await render(TestHost)
    const layout = screen.getByTestId('chat-viewport-layout').element() as HTMLElement
    const historyLayer = screen.getByTestId('chat-history-layer').element() as HTMLElement
    const composer = screen.getByTestId('chat-composer-layer').element() as HTMLElement
    const history = screen.container.querySelector<HTMLElement>('.chat-history-list')
    const scrollbar = screen.container.querySelector<HTMLElement>('.scrollable-area-scrollbar--vertical')

    expect(history).not.toBeNull()
    expect(scrollbar).not.toBeNull()
    if (!history || !scrollbar)
      throw new Error('Expected the chat history viewport and its custom scrollbar.')

    await vi.waitFor(() => {
      expect(getComputedStyle(history).paddingBottom).toBe('112px')
    })

    const layoutRect = layout.getBoundingClientRect()
    const historyRect = historyLayer.getBoundingClientRect()
    expect(historyRect.top).toBe(layoutRect.top)
    expect(historyRect.right).toBe(layoutRect.right)
    expect(historyRect.bottom).toBe(layoutRect.bottom)
    expect(getComputedStyle(history).borderRadius).toBe('0px')

    const scrollbarRect = scrollbar.getBoundingClientRect()
    expect(scrollbarRect.top).toBe(historyRect.top)
    expect(scrollbarRect.right).toBe(historyRect.right)
    expect(scrollbarRect.bottom).toBe(historyRect.bottom)
    expect(layoutRect.right - composer.getBoundingClientRect().right).toBe(26)

    const composerTop = composer.getBoundingClientRect().top
    history.scrollTop = 120
    history.dispatchEvent(new Event('scroll'))
    expect(composer.getBoundingClientRect().top).toBe(composerTop)
    expect(history.scrollHeight).toBeGreaterThan(history.clientHeight)
  })
})
