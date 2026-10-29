import type { TraceRecord, TraceRecordInput } from '../core/types'

import { describe, expect, it } from 'vitest'

import { createRecordStamper } from '../testing'
import { TraceReader } from './reader'
import { createTimelineProjection } from './timeline'

/**
 * Heap and time of a reader for many spans. The budgets are loose for CI machines. The printed table holds the real
 * numbers.
 *
 * The collector keeps 16 MB of records by default, about 30,000 spans. The reader holds the indexes and the
 * projection state of every record in that window.
 */
const SPANS = 100_000

/**
 * The Node globals of the benchmark. The package has no Node types, because its source runs in browsers. The Vitest
 * config starts the workers with `--expose-gc`.
 */
interface NodeRuntime {
  gc: () => void
  process: { memoryUsage: () => { heapUsed: number } }
}

function isNodeRuntime(value: object): value is NodeRuntime {
  return 'gc' in value && typeof value.gc === 'function'
    && 'process' in value && typeof value.process === 'object' && value.process !== null
    && 'memoryUsage' in value.process && typeof value.process.memoryUsage === 'function'
}

const scope: object = globalThis
if (!isNodeRuntime(scope))
  throw new Error('The reader benchmark needs Node with --expose-gc.')
const runtime = scope

/** The used heap after two full collections, so garbage of earlier steps does not count. */
function heapUsed(): number {
  runtime.gc()
  runtime.gc()
  return runtime.process.memoryUsage().heapUsed
}

/** Begin and end records of model, tool, and recognition spans, 10 ms apart, with a turn ID per 16 spans. */
function spanRecords(count: number): TraceRecord[] {
  const tracks = ['agents/agent/llm', 'agents/agent/tools', 'participants/user/asr']
  const inputs: TraceRecordInput[] = []
  for (let index = 0; index < count; index++) {
    const track = tracks[index % 3]!
    inputs.push({ type: 'span.begin', ts: index * 10, track, spanId: `s${index}`, name: 'chat', ids: { turn: `t${index >> 4}` }, attrs: { 'gen_ai.request.model': 'demo-model' } })
    inputs.push({ type: 'span.end', ts: index * 10 + 8, track, spanId: `s${index}`, status: 'ok', attrs: { 'gen_ai.usage.input_tokens': 1200 } })
  }
  return inputs.map(createRecordStamper())
}

/** The heap that a reader adds after it reads the records, and the time that it takes. */
function measure(records: TraceRecord[], withTimeline: boolean): { bytes: number, ms: number, reader: TraceReader } {
  const before = heapUsed()
  const started = performance.now()
  const reader = new TraceReader(withTimeline ? [createTimelineProjection()] : [])
  reader.handleRecords(records)
  const ms = performance.now() - started
  return { bytes: heapUsed() - before, ms, reader }
}

describe('trace reader benchmark', () => {
  const rows: Record<string, string>[] = []

  it(`holds ${SPANS.toLocaleString('en')} spans`, () => {
    const records = spanRecords(SPANS)
    const indexes = measure(records, false)
    const full = measure(records, true)
    const perSpan = (bytes: number) => `${Math.round(bytes / SPANS)} B/span`
    const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`

    rows.push({ part: 'indexes', heap: mb(indexes.bytes), share: perSpan(indexes.bytes), time: `${indexes.ms.toFixed(0)} ms` })
    rows.push({ part: 'indexes + timeline', heap: mb(full.bytes), share: perSpan(full.bytes), time: `${full.ms.toFixed(0)} ms` })
    rows.push({ part: 'timeline', heap: mb(full.bytes - indexes.bytes), share: perSpan(full.bytes - indexes.bytes) })

    const columns = ['part', 'heap', 'share', 'time']
    const table = [
      `| ${columns.join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...rows.map(row => `| ${columns.map(column => row[column] ?? '').join(' | ')} |`),
    ]
    console.info(`\n${table.join('\n')}`)

    expect(full.reader.indexes.bySpanId.size).toBe(SPANS)
    expect(full.bytes / SPANS).toBeLessThan(1200)
    expect(full.ms).toBeLessThan(2000)
  })
})
