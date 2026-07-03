/**
 * AIRI Core — Telemetry
 *
 * Self-contained instrumentation library with four primitives
 * (Counter, Gauge, Histogram) and a MetricRegistry that aggregates
 * them for scraping in Prometheus text exposition format.
 */

export { Counter, DEFAULT_HISTOGRAM_BUCKETS, escapeLabelValue, Gauge, Histogram } from './metrics.js'
export type { HistogramBucket, HistogramSnapshot } from './metrics.js'
export type { Counter as CounterInstrument } from './metrics.js'
export type { Gauge as GaugeInstrument } from './metrics.js'
export { getDefaultRegistry, MetricRegistry, resetDefaultRegistry } from './registry.js'
