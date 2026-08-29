import { ScrollableArea } from '@proj-airi/ui'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, shallowRef } from 'vue'

describe('shared scrollable area', () => {
  it('exposes the Reka viewport and renders the requested scrollbar', async () => {
    const area = shallowRef<InstanceType<typeof ScrollableArea>>()
    const TestHost = defineComponent({
      components: { ScrollableArea },
      setup: () => ({ area }),
      template: `
        <ScrollableArea ref="area" type="always" style="height: 120px">
          <div style="height: 240px">Scrollable content</div>
        </ScrollableArea>
      `,
    })

    const screen = await render(TestHost)
    const viewport = screen.container.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')

    expect(viewport).not.toBeNull()
    expect(viewport?.clientHeight).toBe(120)
    expect(screen.container.querySelector('[data-orientation="vertical"]')).not.toBeNull()
    expect(area.value?.viewport).toBe(viewport)
  })

  it('renders both scrollbar orientations around the same viewport', async () => {
    const TestHost = defineComponent({
      components: { ScrollableArea },
      template: `
        <ScrollableArea orientation="both" type="always" style="height: 120px; width: 120px">
          <div style="height: 240px; width: 240px">Two-axis content</div>
        </ScrollableArea>
      `,
    })

    const screen = await render(TestHost)
    const viewport = screen.container.querySelector('[data-reka-scroll-area-viewport]')
    const verticalTrack = screen.container.querySelector<HTMLElement>('[data-orientation="vertical"]')
    const horizontalTrack = screen.container.querySelector<HTMLElement>('[data-orientation="horizontal"]')
    const verticalThumb = verticalTrack?.firstElementChild as HTMLElement | null
    const horizontalThumb = horizontalTrack?.firstElementChild as HTMLElement | null

    expect(viewport).not.toBeNull()
    expect(verticalThumb?.getBoundingClientRect().width).toBeGreaterThan(0)
    expect(verticalThumb?.getBoundingClientRect().height).toBeGreaterThan(0)
    expect(horizontalThumb?.getBoundingClientRect().width).toBeGreaterThan(0)
    expect(horizontalThumb?.getBoundingClientRect().height).toBeGreaterThan(0)
    expect(viewport?.textContent).toContain('Two-axis content')
  })

  it('keeps max-height panels scrollable without a fixed height', async () => {
    const TestHost = defineComponent({
      components: { ScrollableArea },
      template: `
        <ScrollableArea type="always" style="max-height: 120px">
          <div style="height: 240px">Tall preview</div>
        </ScrollableArea>
      `,
    })

    const screen = await render(TestHost)
    const viewport = screen.container.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')

    expect(viewport?.clientHeight).toBe(120)
    expect(viewport?.scrollHeight).toBe(240)
  })
})
