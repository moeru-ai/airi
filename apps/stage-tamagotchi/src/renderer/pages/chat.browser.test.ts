import { ScrollableArea } from '@proj-airi/ui'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'

import ChatPageShell from './chat-page-shell.vue'

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
