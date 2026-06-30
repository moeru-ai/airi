/**
 * AIRI Core — Metric Registry
 *
 * Owns the set of registered metric instruments and exposes them as a
 * single Prometheus-compatible scrape payload. One registry per daemon
 * instance; components create instruments at construction time and
 * mutate them during operation.
 *
 * The registry is the source of truth for which metrics are exported
 * at /metrics — components don't need to register each data point, only
 * the instrument that produces them.
 */

import { Counter, Gauge, Histogram } from './metrics.js'

// ── Registry ────────────────────────────────────────────────────────────

/**
 * Metric registry.
 *
 * Holds references to Counter/Gauge/Histogram instruments. The
 * registry neither owns instrumentation logic (that lives in each
 * instrument) nor does it imply a particular exposition format —
 * `expose()` renders Prometheus text, but the registry can be
 * serialised to JSON as well.
 */
export class MetricRegistry {
	private readonly instruments = new Set<Counter | Gauge | Histogram>()

	/**
	 * Register an instrument. Subsequent calls with the same instance
	 * are idempotent (set deduplicates).
	 */
	register(instrument: Counter | Gauge | Histogram): Counter | Gauge | Histogram {
		this.instruments.add(instrument)
		return instrument
	}

	/**
	 * Create and register a Counter in one step.
	 */
	createCounter(name: string, help: string, labelKeys: readonly string[] = []): Counter {
		const counter = new Counter(name, help, labelKeys)
		this.register(counter)
		return counter
	}

	/**
	 * Create and register a Gauge in one step.
	 */
	createGauge(name: string, help: string, labelKeys: readonly string[] = []): Gauge {
		const gauge = new Gauge(name, help, labelKeys)
		this.register(gauge)
		return gauge
	}

	/**
	 * Create and register a Histogram in one step.
	 */
	createHistogram(
		name: string,
		help: string,
		options?: { labelKeys?: readonly string[]; buckets?: readonly number[] },
	): Histogram {
		const histogram = new Histogram(name, help, options)
		this.register(histogram)
		return histogram
	}

	/**
	 * Render all registered instruments as a Prometheus text exposition
	 * string (content type `text/plain; version=0.0.4; charset=utf-8`).
	 */
	expose(): string {
		let out = ''
		for (const instrument of this.instruments) {
			out += instrument.expose()
		}
		return out
	}

	/**
	 * Snapshots of each instrument for JSON consumption.
	 */
	snapshot(): Array<{ name: string; type: string; data: unknown }> {
		const result: Array<{ name: string; type: string; data: unknown }> = []
		for (const instrument of this.instruments) {
			if ('entries' in instrument && typeof instrument.entries === 'function') {
				result.push({
					name: instrument.name,
					type: instrumentType(instrument),
					data: instrument.entries(),
				})
			}
		}
		return result
	}
}

function instrumentType(instrument: Counter | Gauge | Histogram): string {
	if ('observe' in instrument) return 'histogram'
	if ('set' in instrument) return 'gauge'
	return 'counter'
}

// ── Default instance ────────────────────────────────────────────────────

/**
 * Module-level default registry for convenience when the daemon
 * only needs a single registry. Prefer injecting instances in tests.
 */
let defaultRegistry: MetricRegistry | undefined

/** Returns the global default registry (creates on first access). */
export function getDefaultRegistry(): MetricRegistry {
	if (!defaultRegistry) {
		defaultRegistry = new MetricRegistry()
	}
	return defaultRegistry
}

/** Clears the default registry (test-only). */
export function resetDefaultRegistry(): void {
	defaultRegistry = undefined
}
