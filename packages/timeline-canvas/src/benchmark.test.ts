import { describe, expect, it } from 'vitest'

import { intervalRuns, pointMarks } from './aggregate'
import { IntervalColumn, PointColumn } from './columns'
import { hitInterval } from './hit'
import { SeriesPyramid } from './series'

/**
 * Work per frame for large lanes. The budgets are loose for CI machines. The printed table holds the real numbers.
 *
 * A frame has about 16 ms. The view work must fit in a few milliseconds, because drawing and Vue take the rest.
 */
const WIDTH = 1600

function time(run: () => void, repeat = 5): number {
  run()
  const started = performance.now()
  for (let index = 0; index < repeat; index++)
    run()
  return (performance.now() - started) / repeat
}

function intervals(count: number): IntervalColumn {
  const column = new IntervalColumn()
  // Spans of 0 to 40 ms that start every 10 ms, in three styles, like a busy voice and model trace.
  for (let index = 0; index < count; index++)
    column.append(index * 10, index * 10 + (index % 5) * 10, index % 3, `span-${index}`)
  return column
}

describe('timeline canvas benchmark', () => {
  const rows: Record<string, string>[] = []

  for (const count of [100_000, 1_000_000]) {
    it(`handles ${count.toLocaleString('en')} intervals`, () => {
      let column!: IntervalColumn
      const appendMs = time(() => {
        column = intervals(count)
      }, 1)
      const total = count * 10
      const fullMs = time(() => intervalRuns(column, { start: 0, end: total, width: WIDTH }))
      const windowMs = time(() => intervalRuns(column, { start: total / 2, end: total / 2 + 30_000, width: WIDTH }))
      const hitMs = time(() => hitInterval(column, { start: total / 2, end: total / 2 + 30_000, width: WIDTH }, 800), 50)
      const fullRuns = intervalRuns(column, { start: 0, end: total, width: WIDTH }).length

      rows.push({ 'items': count.toLocaleString('en'), 'append': `${appendMs.toFixed(0)} ms`, 'zoomed out': `${fullMs.toFixed(2)} ms (${fullRuns} shapes)`, '30 s window': `${windowMs.toFixed(3)} ms`, 'hit test': `${hitMs.toFixed(4)} ms` })

      // A zoomed-out view merges into a bounded number of shapes, whatever the item count.
      expect(fullRuns).toBeLessThanOrEqual(WIDTH * 3 * 2)
      expect(windowMs).toBeLessThan(5)
      expect(hitMs).toBeLessThan(1)
      expect(fullMs).toBeLessThan(count >= 1_000_000 ? 400 : 60)
    })
  }

  it('handles 1,000,000 points and a 1,000,000 sample series', () => {
    const points = new PointColumn()
    for (let index = 0; index < 1_000_000; index++)
      points.append(index * 3, index % 4, `p-${index}`)
    const pointsMs = time(() => pointMarks(points, { start: 0, end: 3_000_000, width: WIDTH }))

    const series = new SeriesPyramid()
    const appendMs = time(() => {
      for (let index = 0; index < 1_000_000; index++)
        series.append(index, Math.sin(index / 50))
    }, 1)
    const envelopeMs = time(() => series.envelope({ start: 0, end: 2_000_000, width: WIDTH }))
    const windowMs = time(() => series.envelope({ start: 400_000, end: 410_000, width: WIDTH }))

    rows.push({ 'items': '1,000,000 points', 'zoomed out': `${pointsMs.toFixed(2)} ms` })
    rows.push({ 'items': '1,000,000 samples', 'append': `${appendMs.toFixed(0)} ms`, 'zoomed out': `${envelopeMs.toFixed(3)} ms`, '30 s window': `${windowMs.toFixed(3)} ms` })

    expect(envelopeMs).toBeLessThan(5)
    expect(pointsMs).toBeLessThan(400)

    const columns = ['items', 'append', 'zoomed out', '30 s window', 'hit test']
    const table = [
      `| ${columns.join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...rows.map(row => `| ${columns.map(column => row[column] ?? '').join(' | ')} |`),
    ]
    console.info(`\n${table.join('\n')}`)
  })
})
