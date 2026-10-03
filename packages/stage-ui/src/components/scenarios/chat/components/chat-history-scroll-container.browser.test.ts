import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, shallowRef } from 'vue'

import ChatHistoryScrollContainer from './chat-history-scroll-container.vue'

describe('chat history scroll container', () => {
  // ROOT CAUSE:
  //
  // Reka mounts the desktop scrollbar only while the viewport scrolls, but it
  // appears and disappears without the overlay fade used by the reference UI.
  // We add the animation only to desktop chat so other scroll areas keep their
  // existing presentation.
  // Reference: https://kingsora.github.io/OverlayScrollbars/example/vue/
  it('shows the desktop scrollbar only while the message viewport scrolls', async () => {
    const container = shallowRef<InstanceType<typeof ChatHistoryScrollContainer>>()
    const TestHost = defineComponent({
      components: { ChatHistoryScrollContainer },
      setup: () => ({ container }),
      template: `
        <ChatHistoryScrollContainer
          ref="container"
          variant="desktop"
          style="height: 120px; width: 240px"
        >
          <div style="height: 240px">Long desktop history</div>
        </ChatHistoryScrollContainer>
      `,
    })

    const screen = await render(TestHost)
    const viewport = screen.container.querySelector<HTMLElement>('.chat-history-list')

    expect(viewport?.matches('[data-reka-scroll-area-viewport]')).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(screen.container.querySelector('.scrollable-area-scrollbar--vertical')).toBeNull()

    if (!viewport)
      throw new Error('Expected a desktop chat history viewport.')

    viewport.scrollTop = 40
    viewport.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => {
      expect(screen.container.querySelector('.scrollable-area-scrollbar--vertical')).not.toBeNull()
    })

    const visibleScrollbar = screen.container.querySelector<HTMLElement>('.scrollable-area-scrollbar--vertical')
    if (!visibleScrollbar)
      throw new Error('Expected the desktop chat scrollbar while scrolling.')

    expect(visibleScrollbar.dataset.state).toBe('visible')
    expect(getComputedStyle(visibleScrollbar).animationName).toContain('chat-history-scrollbar-fade-in')

    await vi.waitFor(() => {
      const hidingScrollbar = screen.container.querySelector<HTMLElement>('.scrollable-area-scrollbar--vertical')
      expect(hidingScrollbar?.dataset.state).toBe('hidden')
      expect(getComputedStyle(hidingScrollbar!).animationName).toContain('chat-history-scrollbar-fade-out')
    }, { interval: 20, timeout: 1200 })
    await vi.waitFor(() => {
      expect(screen.container.querySelector('.scrollable-area-scrollbar--vertical')).toBeNull()
    }, { timeout: 1200 })

    expect(container.value?.viewport).toBe(viewport)
    expect(screen.container.querySelectorAll('.chat-history-list')).toHaveLength(1)
  })

  it('exposes a native overflow viewport for mobile chat', async () => {
    const container = shallowRef<InstanceType<typeof ChatHistoryScrollContainer>>()
    const TestHost = defineComponent({
      components: { ChatHistoryScrollContainer },
      setup: () => ({ container }),
      template: `
        <ChatHistoryScrollContainer
          ref="container"
          variant="mobile"
          style="height: 120px; width: 240px"
        >
          <div style="height: 240px">Long mobile history</div>
        </ChatHistoryScrollContainer>
      `,
    })

    const screen = await render(TestHost)
    const viewport = screen.container.querySelector<HTMLElement>('.chat-history-list')

    expect(viewport).not.toBeNull()
    if (!viewport)
      throw new Error('Expected a mobile chat history viewport.')

    expect(viewport.matches('[data-reka-scroll-area-viewport]')).toBe(false)
    expect(screen.container.querySelector('.scrollable-area-scrollbar--vertical')).toBeNull()
    expect(getComputedStyle(viewport).overflowY).toBe('auto')
    expect(container.value?.viewport).toBe(viewport)
  })
})
