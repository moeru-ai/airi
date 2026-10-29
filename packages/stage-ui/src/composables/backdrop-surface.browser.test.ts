import type { BackdropSurfaceHost } from './backdrop-surface'

import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, nextTick, shallowRef, useTemplateRef } from 'vue'

import { backdropSurfaceHostKey, useBackdropSurface } from './backdrop-surface'

const views: { unmount: () => void }[] = []

afterEach(() => {
  views.splice(0).forEach(view => view.unmount())
})

/** Records which elements the host draws glass behind. */
function recordingHost() {
  const registered = new Set<HTMLElement>()
  const host: BackdropSurfaceHost = {
    register(element) {
      registered.add(element)
      return () => registered.delete(element)
    },
  }
  return { host, registered }
}

async function mountCard(options: { host?: BackdropSurfaceHost } = {}) {
  const shown = shallowRef(true)
  const enabled = shallowRef(true)
  const view = await render(defineComponent({
    setup() {
      useBackdropSurface(useTemplateRef<HTMLElement>('card'), { enabled })
      return { shown }
    },
    template: '<section v-if="shown" ref="card" aria-label="Card">Speech</section>',
  }), { global: { provide: options.host ? { [backdropSurfaceHostKey as symbol]: options.host } : {} } })
  views.push(view)
  return { view, shown, enabled }
}

describe('useBackdropSurface', () => {
  it('does nothing without a host', async () => {
    const { view, shown } = await mountCard()

    await expect.element(view.getByRole('region', { name: 'Card' })).toBeVisible()
    shown.value = false
    await nextTick()
    expect(view.getByRole('region', { name: 'Card' }).query()).toBeNull()
  })

  it('registers the element while it is mounted and enabled', async () => {
    const { host, registered } = recordingHost()
    const { view, shown, enabled } = await mountCard({ host })
    const card = view.getByRole('region', { name: 'Card' }).element()

    await expect.poll(() => [...registered]).toEqual([card])

    enabled.value = false
    await expect.poll(() => registered.size).toBe(0)
    enabled.value = true
    await expect.poll(() => [...registered]).toEqual([card])

    shown.value = false
    await expect.poll(() => registered.size).toBe(0)
    // A card that appears again is a new element, and it registers again.
    shown.value = true
    await expect.poll(() => registered.size).toBe(1)
    expect([...registered][0]).not.toBe(card)
    expect([...registered][0]).toBe(view.getByRole('region', { name: 'Card' }).element())

    view.unmount()
    views.splice(0)
    expect(registered.size).toBe(0)
  })
})
