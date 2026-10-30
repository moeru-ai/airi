import type { TimelineItemRef } from '../headless'
import type { RowModel } from '../types'

import { IntervalColumn, PointColumn } from '@proj-airi/timeline-canvas'
import { describe, expect, it } from 'vitest'

import { rowItem } from './row-item'

interface Named extends TimelineItemRef {
  name: string
}

function model(parts: { points?: Named[], layers?: Named[][], states?: Named[] }): RowModel<Named> {
  return {
    states: { column: new IntervalColumn(), targets: parts.states ?? [] },
    layers: (parts.layers ?? []).map(targets => ({ column: new IntervalColumn(), targets })),
    points: new PointColumn(),
    pointTargets: parts.points ?? [],
    styles: [],
  }
}

describe('rowItem', () => {
  it('finds a point, an interval of any layer, and a state band by key', () => {
    const point = { key: 'p', name: 'point' }
    const span = { key: 's', name: 'span' }
    const state = { key: 'st', name: 'state' }
    const row = model({ points: [point], layers: [[{ key: 'other', name: 'other' }], [span]], states: [state] })

    expect(rowItem(row, 'p')).toBe(point)
    expect(rowItem(row, 's')).toBe(span)
    expect(rowItem(row, 'st')).toBe(state)
  })

  it('finds nothing for a missing key or a missing row', () => {
    expect(rowItem(model({ layers: [[{ key: 's', name: 'span' }]] }), 'gone')).toBeUndefined()
    expect(rowItem(undefined, 's')).toBeUndefined()
  })
})
