/**
 * server-runtime — Metric Registry
 *
 * Self-contained Prometheus-compatible metric registry for the standalone
 * websocket server. Mirrors the core/telemetry/ surface (Counter/Gauge/
 * Histogram primitives + MetricRegistry aggregator) so that downstream
 * callers (Electron main, CI smoke tests) get a consistent /metrics
 * endpoint whether or not the full AIRI core kernel is running.
 *
 * Primitive definitions are intentionally duplicated here to keep
 * server-runtime dependency-free with respect to core/.
 */

// ── Label escaping (Prometheus text format rules) ──────────────────────

/** Escapes backslash and double-quote in label values. */
export function escapeLabelValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/** Escapes backslash and newline in trailing HELP text. */
export function escapeHelp(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('\n', '\\n')
}

// ── Counter ─────────────────────────────────────────────────────────────

/**
 * A counter: monotonically non-decreasing value (resets on restart).
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

  inc(amount = 1, labels: Readonly<Record<string, string>> = {}): void {
    const key = this.labelsKey(labels)
    const current = this.dataPoints.get(key) ?? 0
    this.dataPoints.set(key, current + amount)
  }

  get(labels: Readonly<Record<string, string>> = {}): number {
    return this.dataPoints.get(this.labelsKey(labels)) ?? 0
  }

  expose(): string {
    let out = `# HELP ${this._name} ${escapeHelp(this._help)}\n`
    out += `# TYPE ${this._name} counter\n`
    for (const [key, value] of this.dataPoints) {
      out += `${this._name}${this.formatLabels(this.parseLabelsKey(key))} ${value}\n`
    }
    return out
  }

  private labelsKey(labels: Readonly<Record<string, string>>): string {
    return this._labelKeys.map((k) => `${k}=${labels[k] ?? ''}`).join('|')
  }

  private parseLabelsKey(key: string): Record<string, string> {
    const labels: Record<string, string> = {}
    if (key.length === 0) return labels
    for (const pair of key.split('|')) {
      const eq = pair.indexOf('=')
      if (eq > 0) labels[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    return labels
  }

  private formatLabels(labels: Record<string, string>): string {
    const keys = Object.keys(labels)
    if (keys.length === 0) return ''
    const inner = keys.map((k) => `${k}="${escapeLabelValue(labels[k])}"`).join(',')
    return `{${inner}}`
  }
}

// ── Gauge ──────────────────────────────────────────────────────────────

/**
 * A gauge: value can go up or down.
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
    this.dataPoints.set(this.labelsKey(labels), value)
  }

  get(labels: Readonly<Record<string, string>> = {}): number {
    return this.dataPoints.get(this.labelsKey(labels)) ?? 0
  }

  expose(): string {
    let out = `# HELP ${this._name} ${escapeHelp(this._help)}\n`
    out += `# TYPE ${this._name} gauge\n`
    for (const [key, value] of this.dataPoints) {
      out += `${this._name}${this.formatLabels(this.parseLabelsKey(key))} ${value}\n`
    }
    return out
  }

  private labelsKey(labels: Readonly<Record<string, string>>): string {
    return this._labelKeys.map((k) => `${k}=${labels[k] ?? ''}`).join('|')
  }

  private parseLabelsKey(key: string): Record<string, string> {
    const labels: Record<string, string> = {}
    if (key.length === 0) return labels
    for (const pair of key.split('|')) {
      const eq = pair.indexOf('=')
      if (eq > 0) labels[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    return labels
  }

  private formatLabels(labels: Record<string, string>): string {
    const keys = Object.keys(labels)
    if (keys.length === 0) return ''
    const inner = keys.map((k) => `${k}="${escapeLabelValue(labels[k])}"`).join(',')
    return `{${inner}}`
  }
}

// ── MetricRegistry ──────────────────────────────────────────────────────

/**
 * Aggregates Counter/Gauge instruments and renders them as Prometheus
 * text exposition.
 */
export class MetricRegistry {
  private readonly instruments = new Set<Counter | Gauge>()

  register(instrument: Counter | Gauge): Counter | Gauge {
    this.instruments.add(instrument)
    return instrument
  }

  createCounter(name: string, help: string, labelKeys: readonly string[] = []): Counter {
    const counter = new Counter(name, help, labelKeys)
    this.register(counter)
    return counter
  }

  createGauge(name: string, help: string, labelKeys: readonly string[] = []): Gauge {
    const gauge = new Gauge(name, help, labelKeys)
    this.register(gauge)
    return gauge
  }

  /**
   * Render all registered instruments in Prometheus text exposition
   * format. Multiple registries can be merged by calling expose() on
   * each and concatenating the output.
   */
  expose(): string {
    let out = ''
    for (const instrument of this.instruments) {
      out += instrument.expose()
    }
    return out
  }
}
