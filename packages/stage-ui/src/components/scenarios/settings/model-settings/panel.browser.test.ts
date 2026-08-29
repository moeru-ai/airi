import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'

import ModelSettingsScrollArea from './scroll-area.vue'

describe('model settings panel scrolling', () => {
  // https://github.com/moeru-ai/airi/pull/2399#discussion_r3886186885
  // ROOT CAUSE:
  //
  // The previous regression test inspected source text instead of rendered
  // behavior. It passed even if the panel lost its bounded Reka viewport.
  it('keeps the Reka viewport as the only bounded vertical scroll owner', async () => {
    const TestHost = defineComponent({
      components: { ModelSettingsScrollArea },
      template: `
        <ModelSettingsScrollArea style="height: 120px; width: 320px">
          <div style="height: 240px">Model settings</div>
        </ModelSettingsScrollArea>
      `,
    })
    const screen = await render(TestHost)

    const viewport = screen.container.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')

    expect(viewport).not.toBeNull()
    if (!viewport)
      throw new Error('Expected the model settings Reka viewport.')

    await vi.waitFor(() => {
      expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
      expect(screen.container.querySelector('.scrollable-area-scrollbar--vertical')).not.toBeNull()
    })

    expect(getComputedStyle(viewport).overflowY).toBe('scroll')

    const nestedScrollOwners = [...viewport.querySelectorAll<HTMLElement>('*')]
      .filter((element) => {
        return ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
      })

    expect(nestedScrollOwners).toHaveLength(0)
  })
})
