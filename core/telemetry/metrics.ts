/**
 * AIRI Core — Telemetry Metric Primitives
 *
 * Self-contained metric types for instrumentation. Zero external
 * dependencies, supports Prometheus text exposition.
 *
 * Primitives:
 * - Counter: monotonically increasing value (resets on process restart)
 * - Gauge: arbitrary up/down value
 * - Histogram: buckets observations into buckets with a +Inf catch-all
 * - Summary: tracks sliding-window quantiles (simplified — current value snapshot)
 *
 * Each instrument tracks optional dimensions (labels) as string key/value
 * pairs. Labels are preserved per series and surfaced in exposition.
 */

// ── Labels ──────────────────────────────────────────────────────────────

/** Escapes per Prometheus rules: backslash and double-quote in values. */
export function escapeLabelValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/** Escapes newlines in the trailing HELP text. */
export function escapeHelp(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('\n', '\\n')
}

// ── Counter ─────────────────────────────────────────────────────────────

/**
 * A counter: monotonically non-decreasing value.
 *
 * Suitable for tracking worker starts, crashes, tasks created, tasks
 * completed, or any event that only increases across the process
 * lifetime.
 */
export class Counter {
  private readonly dataPoints = new Map<string, number>()
  private readonly _name: string
  private readonly _help: string
  private readonly _labelKeys: readonly string[]

  constructor(name: string, help: string, labelKeys: readonly string[] = []) {
    this._name = name
    this._help = help
    this._labelKeys = labelKeys
  }

  get name(): string {
    return this._name
  }

  /**
   * Increment the counter by `amount` (default 1).
   * `labels` must match the keys provided at construction.
   */
  inc(amount = 1, labels: Readonly<Record<string, string>> = {}): void {
    const key = this.labelsKey(labels)
    const current = this.dataPoints.get(key) ?? 0
    this.dataPoints.set(key, current + amount)
  }

  /**
   * Get the current value for a specific label set.
   */
  get(labels: Readonly<Record<string, string>> = {}): number {
    return this.dataPoints.get(this.labelsKey(labels)) ?? 0
  }

  /**
   * Iterate over all observed label sets and their values.
   */
  entries(): Array<{ labels: Record<string, string>, value: number }> {
    const result: Array<{ labels: Record<string, string>, value: number }> = []
    for (const [key, value] of this.dataPoints) {
      result.push({ labels: this.parseLabelsKey(key), value })
    }
    return result
  }

  /** Render this counter in Prometheus text exposition format. */
  expose(): string {
    let out = `# HELP ${this._name} ${escapeHelp(this._help)}\n`
    out += `# TYPE ${this._name} counter\n`
    for (const { labels, value } of this.entries()) {
      out += `${this._name}${this.formatLabels(labels)} ${value}\n`
    }
    return out
  }

  private labelsKey(labels: Readonly<Record<string, string>>): string {
    return this._labelKeys
      .map(k => `${k}=${labels[k] ?? ''}`)
      .join('|')
  }

  private parseLabelsKey(key: string): Record<string, string> {
    const labels: Record<string, string> = {}
    if (key.length === 0)
      return labels
    for (const pair of key.split('|')) {
      const eq = pair.indexOf('=')
      if (eq > 0)
        labels[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    return labels
  }

  private formatLabels(labels: Record<string, string>): string {
    const keys = Object.keys(labels)
    if (keys.length === 0)
      return ''
    const inner = keys.map(k => `${k}="${escapeLabelValue(labels[k])}"`).join(',')
    return `{${inner}}`
  }
}

// ── Gauge ──────────────────────────────────────────────────────────────

/**
 * A gauge: value can go up or down.
 *
 * Suitable for current queue size, active worker count, memory usage.
 */
export class Gauge {
  private readonly dataPoints = new Map<string, number>()
  private readonly _name: string
  private readonly _help: string
  private readonly _labelKeys: readonly string[]

  constructor(name: string, help: string, labelKeys: readonly string[] = []) {
    this._name = name
    this._help = help
    this._labelKeys = labelKeys
  }

  get name(): string {
    return this._name
  }

  inc(amount = 1, labels: Readonly<Record<string, string>> = {}): void {
    const key = this.labelsKey(labels)
    const current = this.dataPoints.get(key) ?? 0
    this.dataPoints.set(key, current + amount)
  }

  dec(amount = 1, labels: Readonly<Record<string, string>> = {}): void {
    this.inc(-amount, labels)
  }

  set(value: number, labels: Readonly<Record<string, string>> = {}): void {
    const key = this.labelsKey(labels)
    this.dataPoints.set(key, value)
  }

  get(labels: Readonly<Record<string, string>> = {}): number {
    return this.dataPoints.get(this.labelsKey(labels)) ?? 0
  }

  entries(): Array<{ labels: Record<string, string>, value: number }> {
    const result: Array<{ labels: Record<string, string>, value: number }> = []
    for (const [key, value] of this.dataPoints) {
      result.push({ labels: this.parseLabelsKey(key), value })
    }
    return result
  }

  expose(): string {
    let out = `# HELP ${this._name} ${escapeHelp(this._help)}\n`
    out += `# TYPE ${this._name} gauge\n`
    for (const { labels, value } of this.entries()) {
      out += `${this._name}${this.formatLabels(labels)} ${value}\n`
    }
    return out
  }

  private labelsKey(labels: Readonly<Record<string, string>>): string {
    return this._labelKeys
      .map(k => `${k}=${labels[k] ?? ''}`)
      .join('|')
  }

  private parseLabelsKey(key: string): Record<string, string> {
    const labels: Record<string, string> = {}
    if (key.length === 0)
      return labels
    for (const pair of key.split('|')) {
      const eq = pair.indexOf('=')
      if (eq > 0)
        labels[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    return labels
  }

  private formatLabels(labels: Record<string, string>): string {
    const keys = Object.keys(labels)
    if (keys.length === 0)
      return ''
    const inner = keys.map(k => `${k}="${escapeLabelValue(labels[k])}`).join(',')
    return `{${inner}}`
  }
}

// ── Histogram ───────────────────────────────────────────────────────────

/**
 * Histogram: counts observations into configurable buckets and reports
 * per-bucket cumulative counts plus total sum and count.
 *
 * Default buckets are tuned for sub-second to tens-of-seconds task
 * durations (in milliseconds), which cover the common case for AIRI
 * task orchestration.
 */

export const DEFAULT_HISTOGRAM_BUCKETS = [
  50,
  100,
  250,
  500,
  1000,
  2500,
  5000,
  10000,
] as const

export interface HistogramBucket {
  upperBound: number
  count: number
}

export interface HistogramSnapshot {
  buckets: HistogramBucket[]
  count: number
  sum: number
  labels: Record<string, string>
}

interface HistogramSeries {
  buckets: Map<number, number>
  totalCount: number
  totalSum: number
}

export class Histogram {
  private readonly dataPoints = new Map<string, HistogramSeries>()
  private readonly _name: string
  private readonly _help: string
  private readonly _labelKeys: readonly string[]
  private readonly _buckets: readonly number[]

  constructor(
    name: string,
    help: string,
    options: {
      labelKeys?: readonly string[]
      buckets?: readonly number[]
    } = {},
  ) {
    this._name = name
    this._help = help
    this._labelKeys = options.labelKeys ?? []
    // Buckets must be sorted ascending for cumulative behavior.
    this._buckets = options.buckets
      ? [...options.buckets].sort((a, b) => a - b)
      : [...DEFAULT_HISTOGRAM_BUCKETS]
  }

  get name(): string {
    return this._name
  }

  observe(value: number, labels: Readonly<Record<string, string>> = {}): void {
    const key = this.labelsKey(labels)
    const series = this.seriesFor(key)
    series.totalCount++
    series.totalSum += value

    for (const bound of this._buckets) {
      if (value <= bound) {
        series.buckets.set(bound, (series.buckets.get(bound) ?? 0) + 1)
      }
    }
  }

  entries(): HistogramSnapshot[] {
    const result: HistogramSnapshot[] = []
    for (const [key, series] of this.dataPoints) {
      const buckets: HistogramBucket[] = []
      for (const bound of this._buckets) {
        buckets.push({ upperBound: bound, count: series.buckets.get(bound) ?? 0 })
      }
      result.push({
        buckets,
        count: series.totalCount,
        sum: series.totalSum,
        labels: this.parseLabelsKey(key),
      })
    }
    return result
  }

  expose(): string {
    let out = `# HELP ${this._name} ${escapeHelp(this._help)}\n`
    out += `# TYPE ${this._name} histogram\n`
    for (const { buckets, count, sum, labels } of this.entries()) {
      const labelStr = this.formatLabels(labels)
      for (const bucket of buckets) {
        const labelWithBucket = this.formatLabels(labels, 'bucket', String(bucket.upperBound))
        out += `${this._name}_bucket${labelWithBucket} ${bucket.count}\n`
      }
      // +Inf bucket always equals total count.
      const infLabels = this.formatLabels(labels, 'bucket', '+Inf')
      out += `${this._name}_bucket${infLabels} ${count}\n`
      out += `${this._name}_sum${labelStr} ${sum}\n`
      out += `${this._name}_count${labelStr} ${count}\n`
    }
    return out
  }

  private seriesFor(key: string): HistogramSeries {
    const existing = this.dataPoints.get(key)
    if (existing)
      return existing
    const fresh: HistogramSeries = {
      buckets: new Map(),
      totalCount: 0,
      totalSum: 0,
    }
    this.dataPoints.set(key, fresh)
    return fresh
  }

  private labelsKey(labels: Readonly<Record<string, string>>): string {
    return this._labelKeys
      .map(k => `${k}=${labels[k] ?? ''}`)
      .join('|')
  }

  private parseLabelsKey(key: string): Record<string, string> {
    const labels: Record<string, string> = {}
    if (key.length === 0)
      return labels
    for (const pair of key.split('|')) {
      const eq = pair.indexOf('=')
      if (eq > 0)
        labels[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    return labels
  }

  private formatLabels(labels: Record<string, string>, extraKey?: string, extraValue?: string): string {
    const keys = Object.keys(labels)
    const parts = keys.map(k => `${k}="${escapeLabelValue(labels[k])}"`)
    if (extraKey !== undefined && extraValue !== undefined) {
      parts.push(`${extraKey}="${escapeLabelValue(extraValue)}"`)
    }
    if (parts.length === 0)
      return ''
    return `{${parts.join(',')}}`
  }
}
