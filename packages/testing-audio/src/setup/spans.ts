import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

/**
 * The spans of several windows, each span one time, in the order of first appearance.
 *
 * Every window of an Electron app has the probe, and every probe hears the same spans on the trace channel. So the
 * runtime window and the interaction window both hold each span. The trace ID and the span ID name a span.
 *
 * @example
 * uniqueSpans([a, b], [a])
 * // => [a, b]
 */
export function uniqueSpans(...lists: SerializedIOSpan[][]): SerializedIOSpan[] {
  const seen = new Set<string>()
  const spans: SerializedIOSpan[] = []
  for (const span of lists.flat()) {
    const key = `${span.traceId}/${span.spanId}`
    if (seen.has(key))
      continue
    seen.add(key)
    spans.push(span)
  }
  return spans
}
