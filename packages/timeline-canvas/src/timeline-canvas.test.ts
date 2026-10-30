import { afterEach, describe, expect, it, vi } from 'vitest'

import { intervalRuns, pointMarks } from './aggregate'
import { CAPSULE_COLORS, capsuleStyle, laneCapsuleStyle, laneLayerOf, StyleTable } from './capsule'
import { IntervalColumn, PointColumn } from './columns'
import { hitInterval, hitPoint } from './hit'
import { drawTimelineRow, ROW_GEOMETRY, rowItemGeometry } from './row'
import { lowerBound, upperBound } from './search'
import { SeriesPyramid, waveformColumns } from './series'

const view = { start: 0, end: 1000, width: 1000 }

describe('search', () => {
  it('finds the bounds of a value among equal values', () => {
    const column = new Float64Array([1, 3, 3, 5])
    expect(lowerBound(column, 4, 3)).toBe(1)
    expect(upperBound(column, 4, 3)).toBe(3)
    expect(lowerBound(column, 4, 9)).toBe(4)
    expect(upperBound(column, 4, 0)).toBe(0)
  })
})

describe('interval column', () => {
  it('keeps start order when an interval arrives late', () => {
    const column = new IntervalColumn()
    column.append(10, 20, 0, 'a')
    column.append(30, undefined, 0, 'open')
    column.append(5, 8, 1, 'late')

    expect([...column.starts.subarray(0, column.count)]).toEqual([5, 10, 30])
    expect(column.keys).toEqual(['late', 'a', 'open'])
    // The open interval moved one index to the right with the insert.
    expect([...column.openIndices]).toEqual([2])
  })

  it('finds an interval that starts before the view and ends inside it', () => {
    const column = new IntervalColumn()
    column.append(0, 500, 0, 'long')
    column.append(600, 610, 0, 'short')
    const runs = intervalRuns(column, { start: 400, end: 700, width: 300 })
    expect(runs.map(run => column.keys[run.index])).toEqual(['long', 'short'])
  })

  it('draws an open interval that started long ago to now', () => {
    const column = new IntervalColumn()
    column.append(-10_000, undefined, 0, 'open')
    for (let index = 0; index < 100; index++)
      column.append(index * 10, index * 10 + 2, 0, `closed-${index}`)
    const runs = intervalRuns(column, view, { now: 900 })
    const open = runs.find(run => column.keys[run.index] === 'open')
    expect(open?.open).toBe(true)
    expect(open?.x1).toBe(900)
  })
})

describe('interval runs', () => {
  it('merges touching narrow intervals of one style, and keeps wide ones apart', () => {
    const column = new IntervalColumn()
    // Ten 0.5 px intervals that touch, then one wide interval.
    for (let index = 0; index < 10; index++)
      column.append(index, index + 0.5, 0, `narrow-${index}`)
    column.append(100, 200, 0, 'wide')

    const runs = intervalRuns(column, view)
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({ count: 10, x0: 0 })
    expect(runs[1]).toMatchObject({ count: 1, x0: 100, x1: 200 })
  })

  it('does not merge narrow intervals of different styles', () => {
    const column = new IntervalColumn()
    column.append(0, 0.5, 0, 'a')
    column.append(1, 1.5, 1, 'b')
    expect(intervalRuns(column, view)).toHaveLength(2)
  })

  it('draws open intervals from before the view in start order after a late append', () => {
    const column = new IntervalColumn()
    column.append(500, undefined, 0, 'later')
    // This one starts earlier but arrives last, so the column inserts it before the other open interval.
    column.append(100, undefined, 1, 'earlier')

    const runs = intervalRuns(column, { start: 1000, end: 2000, width: 1000 })
    // A later run draws over an earlier one. The interval that starts last is on top, as the hit test prefers it.
    expect(runs.map(run => column.keys[run.index])).toEqual(['earlier', 'later'])
  })

  it('bounds the work of a zoomed-out view by its width', () => {
    const column = new IntervalColumn()
    for (let index = 0; index < 100_000; index++)
      column.append(index, index + 0.5, index % 2, `item-${index}`)
    // 100 000 ms on 1000 px: each pixel holds 100 intervals of two styles.
    const runs = intervalRuns(column, { start: 0, end: 100_000, width: 1000 })
    expect(runs.length).toBeLessThanOrEqual(100_000 / 50)
    expect(runs.reduce((sum, run) => sum + run.count, 0)).toBe(100_000)
  })
})

describe('point marks', () => {
  it('draws sparse points one by one', () => {
    const column = new PointColumn()
    column.append(100, 0, 'a')
    column.append(500, 0, 'b')
    expect(pointMarks(column, view)).toEqual([
      { kind: 'point', x: 100, style: 0, index: 0 },
      { kind: 'point', x: 500, style: 0, index: 1 },
    ])
  })

  it('switches to buckets when points are dense, and counts every point', () => {
    const column = new PointColumn()
    for (let index = 0; index < 20_000; index++)
      column.append(index / 20, 0, `p-${index}`)
    const marks = pointMarks(column, view)
    expect(marks.every(mark => mark.kind === 'bucket')).toBe(true)
    expect(marks.reduce((sum, mark) => sum + (mark.kind === 'bucket' ? mark.count : 1), 0)).toBe(20_000)
  })
})

describe('series pyramid', () => {
  function bruteEnvelope(times: number[], values: number[], start: number, end: number, columns: number) {
    const mins = Array.from<number>({ length: columns }).fill(Number.NaN)
    const maxs = Array.from<number>({ length: columns }).fill(Number.NaN)
    for (const [index, time] of times.entries()) {
      const column = Math.floor((time - start) / (end - start) * columns)
      if (column < 0 || column >= columns)
        continue
      mins[column] = Number.isNaN(mins[column]!) ? values[index]! : Math.min(mins[column]!, values[index]!)
      maxs[column] = Number.isNaN(maxs[column]!) ? values[index]! : Math.max(maxs[column]!, values[index]!)
    }
    return { mins, maxs }
  }

  it('fills short gaps of a waveform by interpolation and blends each bar a little with its neighbors', () => {
    const envelope = { mins: Float32Array.from([0, Number.NaN, 0.4, Number.NaN, Number.NaN, Number.NaN, Number.NaN, 0]), maxs: Float32Array.from([0, Number.NaN, 0.4, Number.NaN, Number.NaN, Number.NaN, Number.NaN, 0]), level: 0 }

    const raw = waveformColumns(envelope, { bridgeColumns: 2, smoothing: 0 })
    // The one-column gap takes the middle value. The four-column gap is a pause and stays empty.
    expect(raw.map(value => value?.max)).toEqual([0, expect.closeTo(0.2), expect.closeTo(0.4), undefined, undefined, undefined, undefined, 0])

    const smooth = waveformColumns(envelope, { bridgeColumns: 2, smoothing: 0.3 })
    // The peak keeps most of its height: 0.4 * 0.7 + (0.2 + 0.4) * 0.15.
    expect(smooth[2]!.max).toBeCloseTo(0.37)
    expect(smooth[3]).toBeUndefined()
  })

  it('reads a coarse level and keeps every peak of the raw samples', () => {
    const pyramid = new SeriesPyramid()
    const times: number[] = []
    const values: number[] = []
    // 48 kHz for 10 s would be 480 000 samples. 100 000 samples with one spike keeps the test fast.
    for (let index = 0; index < 100_000; index++) {
      times.push(index)
      values.push(index === 54_321 ? 1 : Math.sin(index / 40) * 0.3)
    }
    pyramid.appendMany(times, values)

    const envelope = pyramid.envelope({ start: 0, end: 100_000, width: 500 })
    expect(envelope.level).toBeGreaterThan(2)
    expect(Math.max(...envelope.maxs)).toBeCloseTo(1)

    const brute = bruteEnvelope(times, values, 0, 100_000, 500)
    for (let column = 0; column < 500; column++) {
      // A coarse bucket can start in one column and end in the next, so peaks move by at most one column.
      const near = [column - 1, column, column + 1].filter(index => index >= 0 && index < 500)
      expect(Math.max(...near.map(index => envelope.maxs[index]!))).toBeGreaterThanOrEqual(brute.maxs[column]! - 1e-6)
    }
  })

  it('keeps a peak after a pause in its own column when a coarse bucket spans the pause', () => {
    const pyramid = new SeriesPyramid()
    // 200 quiet samples in the first 100 ms, then three more and one peak after a long pause. The last four samples
    // fill one bucket of level 1, which starts before the pause and ends after it.
    for (let index = 0; index < 200; index++)
      pyramid.append(index / 2, 0)
    pyramid.appendMany([100, 100.5, 101, 950], [0, 0, 0, 1])

    const envelope = pyramid.envelope({ start: 0, end: 1000, width: 10 })
    expect(envelope.level).toBe(1)
    expect(envelope.maxs[9]).toBe(1)
    expect(envelope.maxs[1]).toBe(0)
  })

  it('keeps the peaks of coarse buckets across the left and right edges of the view', () => {
    const pyramid = new SeriesPyramid()
    for (let index = 0; index < 600; index++)
      pyramid.append(index, index === 101 || index === 500 ? 1 : 0)

    // Columns of 20 ms. The bucket of 100 to 103 starts before the view and ends in column 0. The bucket of 500 to 503
    // starts in the last column and ends after the view.
    const envelope = pyramid.envelope({ start: 100.5, end: 500.5, width: 20 })
    expect(envelope.level).toBe(1)
    expect(envelope.maxs[0]).toBe(1)
    expect(envelope.maxs[19]).toBe(1)
  })

  it('includes the newest samples that do not fill a coarse bucket yet', () => {
    const pyramid = new SeriesPyramid()
    for (let index = 0; index < 10_003; index++)
      pyramid.append(index, index === 10_002 ? 5 : 0)
    const envelope = pyramid.envelope({ start: 0, end: 10_003, width: 100 })
    expect(envelope.level).toBeGreaterThan(0)
    expect(envelope.maxs[99]).toBe(5)
  })
})

describe('hit testing', () => {
  it('prefers the covering interval that starts last, then the nearest within the tolerance', () => {
    const column = new IntervalColumn()
    column.append(0, 500, 0, 'outer')
    column.append(100, 200, 0, 'inner')
    column.append(700, 701, 0, 'tiny')
    expect(column.keys[hitInterval(column, view, 150)!]).toBe('inner')
    expect(column.keys[hitInterval(column, view, 300)!]).toBe('outer')
    expect(column.keys[hitInterval(column, view, 703)!]).toBe('tiny')
    expect(hitInterval(column, view, 900)).toBeUndefined()
  })

  it('finds the nearest point', () => {
    const column = new PointColumn()
    column.append(100, 0, 'a')
    column.append(110, 0, 'b')
    expect(column.keys[hitPoint(column, view, 108)!]).toBe('b')
    expect(hitPoint(column, view, 300)).toBeUndefined()
  })
})

describe('capsules', () => {
  it('gives each state its look', () => {
    expect(capsuleStyle({ color: 'blue' })).toEqual({ color: 'blue', pattern: 'solid' })
    expect(capsuleStyle({ color: 'blue', activity: 'thinking', open: true })).toEqual({ color: 'blue', pattern: 'soft', shimmer: true })
    // Active work does not shimmer, and abandoned work is not open work.
    expect(capsuleStyle({ color: 'blue', open: true }).shimmer).toBeUndefined()
    expect(capsuleStyle({ color: 'blue', activity: 'waiting', open: true, abandoned: true })).toEqual({ color: 'blue', pattern: 'hatch', stroke: CAPSULE_COLORS.abandoned })
    expect(capsuleStyle({ color: 'blue', activity: 'thinking', failed: true, overdue: true })).toEqual({ color: 'blue', pattern: 'soft', overlay: CAPSULE_COLORS.failedOverlay, stroke: CAPSULE_COLORS.failedStroke, status: 'failed' })
    expect(capsuleStyle({ color: 'blue', retry: true, cancelled: true })).toEqual({ color: 'blue', pattern: 'solid', opacity: 0.55, icon: 'retry' })
    expect(capsuleStyle({ color: 'blue', cancelled: true, dimmed: true }).opacity).toBe(0.25)
  })

  it('puts a failure on the top layer of a lane, with its status dot and without a glyph', () => {
    expect(laneLayerOf({ color: 'blue', activity: 'waiting' })).toBe('waiting')
    expect(laneLayerOf({ color: 'blue', activity: 'waiting', failed: true })).toBe('failed')
    // The rows of the tracks show the icons, so the lane draws none.
    expect(laneCapsuleStyle({ color: 'blue', activity: 'waiting', failed: true, glyph: 'tool' })).toEqual({ color: 'blue', pattern: 'hatch', overlay: CAPSULE_COLORS.failedOverlay, stroke: CAPSULE_COLORS.failedStroke, status: 'failed' })
    expect(laneCapsuleStyle({ color: 'blue', retry: true }).icon).toBeUndefined()
  })

  it('stores each distinct style once', () => {
    const table = new StyleTable()
    expect(table.index(capsuleStyle({ color: 'blue' }))).toBe(table.index(capsuleStyle({ color: 'blue' })))
    expect(table.index(capsuleStyle({ color: 'blue', failed: true }))).toBe(1)
    expect(table.styles).toHaveLength(2)
  })

  it('rejects a style index that a column cannot store, and leaves the column unchanged', () => {
    const intervals = new IntervalColumn()
    expect(() => intervals.append(0, 10, 65_536, 'a')).toThrow(RangeError)
    expect(() => intervals.append(0, 10, -1, 'a')).toThrow(RangeError)
    expect(intervals.count).toBe(0)
    expect(intervals.keys).toEqual([])
    intervals.append(0, 10, 65_535, 'a')
    expect(intervals.styles[0]).toBe(65_535)
    expect(() => intervals.setStyle(0, 65_536)).toThrow(RangeError)
    expect(intervals.styles[0]).toBe(65_535)

    const points = new PointColumn()
    expect(() => points.append(0, 65_536, 'a')).toThrow(RangeError)
    expect(points.count).toBe(0)
  })

  it('stores at most as many styles as a column can index', () => {
    const table = new StyleTable()
    for (let index = 0; index < 65_536; index++)
      table.index({ color: `#${index.toString(16).padStart(6, '0')}` })
    // A known style still resolves when the table is full.
    expect(table.index({ color: '#000000' })).toBe(0)
    expect(() => table.index({ color: '#ffffff' })).toThrow(RangeError)
    expect(table.styles).toHaveLength(65_536)
  })

  it('centers lane items and insets detail items', () => {
    expect(rowItemGeometry('lane', 100, ROW_GEOMETRY.height.lane)).toEqual({ top: 112, height: 30, radius: 6 })
    expect(rowItemGeometry('detail', 100, ROW_GEOMETRY.height.detail)).toEqual({ top: 104, height: 26, radius: 4 })
  })
})

describe('rows with content', () => {
  class FakePath2D {
    constructor(readonly d?: string) {}
  }

  /** A 2D context that records each call in order and accepts each property write. */
  function recordingContext() {
    const calls: { name: string, args: unknown[] }[] = []
    const ctx = new Proxy<Partial<CanvasRenderingContext2D>>({ fillStyle: '#000000' }, {
      get(target, key) {
        if (key in target)
          return Reflect.get(target, key)
        return (...args: unknown[]) => {
          calls.push({ name: String(key), args })
          if (key === 'measureText')
            return { width: 10 }
          if (key === 'createLinearGradient')
            return { addColorStop: () => {} }
          return undefined
        }
      },
      set(target, key, value) {
        return Reflect.set(target, key, value)
      },
    })
    return { ctx: ctx as CanvasRenderingContext2D, calls }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function drawWaveformRow(style: ReturnType<typeof capsuleStyle>) {
    vi.stubGlobal('Path2D', FakePath2D)
    const column = new IntervalColumn()
    column.append(0, 1000, 0, 'item')
    const level = new SeriesPyramid()
    for (let index = 0; index < 1000; index++)
      level.append(index, 1)
    const { ctx, calls } = recordingContext()
    const frame = { view, kind: 'detail' as const, top: 0, height: ROW_GEOMETRY.height.detail }
    drawTimelineRow(ctx, { styles: [style], layers: [{ column }], content: { kind: 'waveform', level } }, frame)
    return { calls, geometry: rowItemGeometry('detail', 0, ROW_GEOMETRY.height.detail) }
  }

  it('draws the retry icon of an item that has a waveform and no label', () => {
    const { calls } = drawWaveformRow(capsuleStyle({ color: '#3b82f6', retry: true }))
    // The retry glyph is a stroked path.
    expect(calls.some(call => call.name === 'stroke' && call.args[0] instanceof FakePath2D)).toBe(true)
  })

  it('keeps the waveform of a failed item below its status dot', () => {
    const { calls } = drawWaveformRow(capsuleStyle({ color: '#3b82f6', failed: true }))
    const arcs = calls.filter(call => call.name === 'arc')
    expect(arcs.length).toBeGreaterThan(0)
    // The dot is a circle at its center y with its radius, and its bottom is their sum.
    const dotBottom = Math.max(...arcs.map(call => (call.args[1] as number) + (call.args[2] as number)))
    const bars = calls.slice(calls.lastIndexOf(arcs.at(-1)!) + 1).filter(call => call.name === 'roundRect')
    expect(bars.length).toBeGreaterThan(0)
    expect(Math.min(...bars.map(call => call.args[1] as number))).toBeGreaterThanOrEqual(dotBottom)
  })
})
