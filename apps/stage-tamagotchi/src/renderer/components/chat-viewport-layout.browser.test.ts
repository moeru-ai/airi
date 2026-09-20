import type { ChatHistoryItem, StreamingAssistantMessage } from '@proj-airi/stage-ui/types/chat'

import en from '@proj-airi/i18n/locales/en'

import { ChatHistory } from '@proj-airi/stage-ui/components'
import { ScrollableArea } from '@proj-airi/ui'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import ChatViewportLayout from './chat-viewport-layout.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function createEnglishI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

describe('desktop chat viewport layout', () => {
  it('keeps history behind the fixed translucent composer', async () => {
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
      expect(Number.parseFloat(getComputedStyle(history, '::after').height)).toBeGreaterThan(80)
      expect(history.scrollHeight).toBeGreaterThan(history.clientHeight)
    })

    const layoutRect = layout.getBoundingClientRect()
    const historyRect = historyLayer.getBoundingClientRect()
    const composerRect = composer.getBoundingClientRect()
    expect(historyRect.top).toBe(layoutRect.top)
    expect(historyRect.right).toBe(layoutRect.right)
    expect(historyRect.bottom).toBe(layoutRect.bottom)
    expect(composerRect.top).toBeLessThan(historyRect.bottom)
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

  // https://github.com/moeru-ai/airi/pull/2489#discussion_r3967818100
  // ROOT CAUSE:
  //
  // The viewport spacer increases the native scroll range, but Virtua calculates
  // end alignment from item offsets that do not include that spacer. An automatic
  // tail scroll therefore leaves the final message behind the fixed composer.
  //
  // The Virtua scroll adapter must add the composer inset to end-aligned requests.
  it('keeps an automatically scrolled long-history tail above the fixed composer', async () => {
    const messages = shallowRef<ChatHistoryItem[]>(Array.from({ length: 40 }, (_, index) => ({
      id: `message-${index}`,
      role: 'user',
      content: `Message ${index}`,
    })))
    const sending = shallowRef(false)
    const streamingMessage = shallowRef<StreamingAssistantMessage>()
    const TestHost = defineComponent({
      components: { ChatHistory, ChatViewportLayout },
      setup() {
        return { messages, sending, streamingMessage }
      },
      template: `
        <ChatViewportLayout style="height: 320px; width: 240px">
          <template #history="{ tailInset }">
            <ChatHistory
              :messages="messages"
              :sending="sending"
              :streaming-message="streamingMessage"
              :tail-inset="tailInset"
            />
          </template>
          <template #composer>
            <div style="height: 80px">Fixed composer</div>
          </template>
        </ChatViewportLayout>
      `,
    })

    const screen = await render(TestHost, {
      global: {
        plugins: [createEnglishI18n()],
      },
    })
    const composer = screen.getByTestId('chat-composer-layer').element() as HTMLElement

    // This case tests automatic following without a reader inspecting history.
    // Keep the browser pointer outside messages while appending and streaming.
    await userEvent.hover(composer)

    async function expectVisibleTail(text: string) {
      await vi.waitFor(() => {
        const mountedMessages = screen.container.querySelectorAll<HTMLElement>('.chat-message-item')
        const finalMessage = [...mountedMessages].find(message => message.textContent?.includes(text))
        expect(finalMessage).not.toBeUndefined()
        expect(finalMessage!.getBoundingClientRect().bottom, text).toBeLessThanOrEqual(composer.getBoundingClientRect().top + 1)
      })
    }

    await expectVisibleTail('Message 39')

    messages.value = [...messages.value, {
      id: 'message-40',
      role: 'user',
      content: 'Appended tail',
    }]
    await expectVisibleTail('Appended tail')

    sending.value = true
    streamingMessage.value = {
      id: 'streaming-tail',
      role: 'assistant',
      content: 'Streaming tail',
      slices: [{ type: 'text', text: 'Streaming tail' }],
      tool_results: [],
    }
    await expectVisibleTail('Streaming tail')

    const expandedStreamText = 'Expanded streaming tail '.repeat(12)
    streamingMessage.value = {
      id: 'streaming-tail',
      role: 'assistant',
      content: expandedStreamText,
      slices: [{ type: 'text', text: expandedStreamText }],
      tool_results: [],
    }
    await expectVisibleTail('Expanded streaming tail')

    // Virtua's scroll request stops waiting for measurements after 150ms.
    // A later layout change must still follow the tail without a model update.
    await new Promise(resolve => setTimeout(resolve, 250))
    const tail = [...screen.container.querySelectorAll<HTMLElement>('.chat-message-item')].at(-1)!
    tail.style.minHeight = `${tail.getBoundingClientRect().height + 64}px`
    await expectVisibleTail('Expanded streaming tail')

    // https://github.com/moeru-ai/airi/pull/2461#discussion_r4003137140
    // ROOT CAUSE:
    // The custom scrollbar is outside the viewport, so viewport input listeners
    // missed pointer scrolls. A later resize pulled the reader back to the tail.
    await new Promise(resolve => setTimeout(resolve, 250))
    const viewport = screen.container.querySelector<HTMLElement>('.chat-history-list')!
    viewport.dispatchEvent(new Event('scroll'))
    await expect.poll(() => screen.container.querySelector('.scrollable-area-scrollbar--vertical')).not.toBeNull()
    const scrollbar = screen.container.querySelector<HTMLElement>('.scrollable-area-scrollbar--vertical')!
    await userEvent.click(scrollbar, { position: { x: 5, y: 20 } })
    await userEvent.hover(composer)
    await expect.poll(() => viewport.scrollTop).toBeLessThan(viewport.scrollHeight - viewport.clientHeight - 24)
    await new Promise(resolve => setTimeout(resolve, 250))
    const readerPosition = viewport.scrollTop
    const mountedTail = [...screen.container.querySelectorAll<HTMLElement>('.chat-message-item')].at(-1)!
    mountedTail.style.minHeight = `${mountedTail.getBoundingClientRect().height + 64}px`
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(viewport.scrollTop).toBe(readerPosition)
  })

  // ROOT CAUSE:
  //
  // Virtua bottom-aligns a short list with transforms. Transforms do not add to
  // the viewport's scroll size, so the composer spacer cannot reveal a message
  // that the transform placed behind the composer.
  //
  // The short-list transform must reserve the composer inset. Long histories
  // still use the viewport spacer and can scroll behind the translucent layer.
  it('keeps a short virtualized history above the fixed composer', async () => {
    const messages: ChatHistoryItem[] = [{
      id: 'short-history-message',
      role: 'user',
      content: 'Short message',
    }]
    const TestHost = defineComponent({
      components: { ChatHistory, ChatViewportLayout },
      setup() {
        return { messages }
      },
      template: `
        <ChatViewportLayout style="height: 320px; width: 240px">
          <template #history="{ tailInset }">
            <ChatHistory :messages="messages" :tail-inset="tailInset" />
          </template>
          <template #composer>
            <div style="height: 80px">Fixed composer</div>
          </template>
        </ChatViewportLayout>
      `,
    })

    const screen = await render(TestHost, {
      global: {
        plugins: [createEnglishI18n()],
      },
    })
    const composer = screen.getByTestId('chat-composer-layer').element() as HTMLElement

    await vi.waitFor(() => {
      const message = screen.container.querySelector<HTMLElement>('.chat-message-item')
      expect(message).not.toBeNull()
      expect(message!.getBoundingClientRect().bottom).toBeLessThanOrEqual(composer.getBoundingClientRect().top)
    })
  })
})
