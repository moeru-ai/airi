import type { RowModel, TimelineRowEntry } from '../types'

import { IntervalColumn, PointColumn } from '@proj-airi/timeline-canvas'
import { describe, expect, it } from 'vitest'

import { RowModelCache } from './row-model-cache'

type Row = TimelineRowEntry & { label: string }

function emptyModel(): RowModel {
  return { states: { column: new IntervalColumn(), targets: [] }, layers: [], points: new PointColumn(), pointTargets: [], styles: [] }
}

describe('rowModelCache', () => {
  const built: string[] = []
  const model = (row: Row) => {
    built.push(row.label)
    return emptyModel()
  }
  const placed = (key: string, label: string) => ({ top: 0, row: { key, label, kind: 'detail' as const, height: 20 } })

  it('keeps the models while nothing changes, and rebuilds them for replaced rows with the same version', () => {
    const cache = new RowModelCache<{ key: string }, Row>()
    const first = [placed('a', 'a1')]
    const inputs = { model, version: 1, selection: undefined, now: 1500 }

    const models = cache.get({ ...inputs, rows: first })
    expect(cache.get({ ...inputs, rows: first, now: 1900 })).toBe(models)
    expect(built).toEqual(['a1'])

    // The consumer replaced the rows: row a has new data, and row b is new. The version stays.
    const next = cache.get({ ...inputs, rows: [placed('a', 'a2'), placed('b', 'b1')] })
    expect(built).toEqual(['a1', 'a2', 'b1'])
    expect([...next.keys()]).toEqual(['a', 'b'])
  })
})
