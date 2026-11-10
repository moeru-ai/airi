import { ScrollableArea } from '@proj-airi/ui'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref, shallowRef } from 'vue'

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

  // ROOT CAUSE:
  // Reka UI 2.10.3 clears both enabled-axis flags when either scrollbar unmounts.
  // Switching away from `both` therefore leaves the surviving axis disabled.
  // We restore the requested flags after Reka finishes the scrollbar DOM update.
  // Report: https://github.com/moeru-ai/airi/pull/2399#discussion_r3886316598
  it('keeps the remaining axis scrollable when orientation changes', async () => {
    const orientation = ref<'vertical' | 'horizontal' | 'both'>('both')
    const TestHost = defineComponent({
      components: { ScrollableArea },
      setup: () => ({ orientation }),
      template: `
        <ScrollableArea :orientation="orientation" type="always" style="height: 120px; width: 120px">
          <div style="height: 240px; width: 240px">Two-axis content</div>
        </ScrollableArea>
      `,
    })

    const screen = await render(TestHost)
    const viewport = screen.container.querySelector<HTMLElement>('[data-reka-scroll-area-viewport]')

    orientation.value = 'vertical'
    await expect.poll(() => viewport?.style.overflowY).toBe('scroll')
    expect(viewport?.style.overflowX).toBe('hidden')
    expect(screen.container.querySelector('[data-orientation="vertical"]')).not.toBeNull()
    expect(screen.container.querySelector('[data-orientation="horizontal"]')).toBeNull()
    viewport!.scrollTop = 40
    expect(viewport?.scrollTop).toBe(40)

    orientation.value = 'horizontal'
    await expect.poll(() => viewport?.style.overflowX).toBe('scroll')
    expect(viewport?.style.overflowY).toBe('hidden')
    expect(screen.container.querySelector('[data-orientation="vertical"]')).toBeNull()
    expect(screen.container.querySelector('[data-orientation="horizontal"]')).not.toBeNull()
    viewport!.scrollLeft = 40
    expect(viewport?.scrollLeft).toBe(40)
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
