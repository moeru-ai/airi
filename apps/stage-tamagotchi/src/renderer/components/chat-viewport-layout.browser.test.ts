import { ScrollableArea } from '@proj-airi/ui'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'

import ChatViewportLayout from './chat-viewport-layout.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

describe('desktop chat viewport layout', () => {
  // ROOT CAUSE:
  //
  // The history viewport must stop above the fixed composer so the scrollbar
  // belongs to messages only instead of extending beside the input controls.
  it('keeps the message viewport above a fixed composer', async () => {
    const TestHost = defineComponent({
      components: { ChatViewportLayout, ScrollableArea },
      template: `
        <ChatViewportLayout style="height: 320px; width: 240px">
          <template #history>
            <ScrollableArea
              type="always"
              viewport-class="chat-history-list"
              style="height: 100%; width: 100%"
            >
              <div style="height: 640px">Long chat history</div>
            </ScrollableArea>
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
      expect(getComputedStyle(history).paddingBottom).toBe('16px')
      expect(history.scrollHeight).toBeGreaterThan(history.clientHeight)
    })

    const layoutRect = layout.getBoundingClientRect()
    const historyRect = historyLayer.getBoundingClientRect()
    const composerRect = composer.getBoundingClientRect()
    expect(historyRect.top).toBe(layoutRect.top)
    expect(historyRect.right).toBe(layoutRect.right)
    expect(historyRect.bottom).toBe(composerRect.top)
    expect(getComputedStyle(history).borderRadius).toBe('0px')

    const scrollbarRect = scrollbar.getBoundingClientRect()
    expect(scrollbarRect.top).toBe(historyRect.top)
    expect(scrollbarRect.right).toBe(historyRect.right)
    expect(scrollbarRect.bottom).toBe(historyRect.bottom)
    expect(layoutRect.right - composerRect.right).toBe(16)

    const composerTop = composer.getBoundingClientRect().top
    history.scrollTop = 120
    history.dispatchEvent(new Event('scroll'))
    expect(composer.getBoundingClientRect().top).toBe(composerTop)
  })
})
