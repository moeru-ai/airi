import type { TimelineRootContext } from '../composables/timeline-root-context'
import type { TimelineItemRef } from '../types'
import type { ListedItem } from '../utils/item-navigation'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'

import TimelineRootHarness from './timeline-root-harness.vue'

import { tickIntervalMs } from '../utils/time-format'

const ITEMS: ListedItem<TimelineItemRef>[] = [
  { target: { key: 'a' }, row: 0, start: 0, end: 100, label: 'Item a' },
  { target: { key: 'b' }, row: 0, start: 200, end: 300, label: 'Item b' },
]

/** Mounts the harness and returns its context once it is ready. */
function mountTimeline() {
  let context: TimelineRootContext<TimelineItemRef> | undefined
  render(TimelineRootHarness, { props: { items: ITEMS, onReady: (ready: TimelineRootContext<TimelineItemRef>) => context = ready } })
  return () => {
    if (!context)
      throw new Error('The timeline root is not mounted.')
    return context
  }
}

describe('timeline root', () => {
  afterEach(cleanup)

  it('makes the tick step follow a zoom inside the render range', async () => {
    await page.viewport(900, 400)
    const context = mountTimeline()
    await expect.poll(() => context().lanesWidth.value).toBeGreaterThan(0)
    const width = context().lanesWidth.value
    const wide = tickIntervalMs(10_000, width)
    const zoomed = tickIntervalMs(2500, width)
    expect(zoomed).toBeLessThan(wide)
    await expect.element(page.getByText(`Tick step ${wide}`)).toBeInTheDocument()

    // Four times in stays inside the render range, so only the step can change the ticks.
    context().zoomAt(5000, 0.25)
    await expect.element(page.getByText(`Tick step ${zoomed}`)).toBeInTheDocument()
  })
})
