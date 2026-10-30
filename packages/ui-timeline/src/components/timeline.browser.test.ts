import type { TimelineItemRef } from '../headless'
import type { RowModel, TimelineRowEntry } from '../types'

import { capsuleStyle, IntervalColumn, PointColumn, StyleTable } from '@proj-airi/timeline-canvas'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'

import Timeline from './timeline.vue'

interface Named extends TimelineItemRef {
  name: string
}

const ROWS: TimelineRowEntry[] = [{ key: 'row', kind: 'detail', height: 28 }]

/** One row with one item over the whole data range. */
function modelOf(name: string): RowModel<Named> {
  const styles = new StyleTable()
  const column = new IntervalColumn()
  column.append(0, 10_000, styles.index(capsuleStyle({ color: '#3b82f6' })), 'item')
  return {
    states: { column: new IntervalColumn(), targets: [] },
    layers: [{ column, targets: [{ key: 'item', name }] }],
    points: new PointColumn(),
    pointTargets: [],
    styles: styles.styles,
  }
}

describe('timeline', () => {
  afterEach(cleanup)

  it('updates the hover card when the row models rebuild under a still pointer', async () => {
    await page.viewport(900, 400)
    const props = { rows: ROWS, listItems: () => [], start: 0, end: 10_000, labelWidth: 0 }
    const screen = render(Timeline, {
      props: { ...props, model: () => modelOf('Version 0') },
      slots: { hover: ({ item }: { item: TimelineItemRef }) => 'name' in item ? String(item.name) : '' },
      attrs: { style: 'width: 860px; height: 200px' },
    })

    const canvas = document.querySelector('canvas')!
    // The pointer stays over the item, in the middle of the row.
    const move = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + 14 }))
    }
    await expect.poll(() => {
      move()
      return document.body.textContent?.includes('Version 0')
    }).toBe(true)

    // A new model function rebuilds the row models with the same rows, for example after a theme change.
    await screen.rerender({ ...props, model: () => modelOf('Version 1') })
    move()
    await expect.element(page.getByText('Version 1')).toBeInTheDocument()
  })
})
