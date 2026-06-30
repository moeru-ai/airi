/**
 * AIRI Core — Telemetry Library Tests
 *
 * Verifies the primitives (Counter, Gauge, Histogram) and the
 * MetricRegistry produce well-formed Prometheus text exposition
 * output.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
	Counter,
	Gauge,
	Histogram,
	MetricRegistry,
	escapeLabelValue,
	getDefaultRegistry,
	resetDefaultRegistry,
} from '../telemetry/index.js'

// ── Helpers ─────────────────────────────────────────────────────────────

function extractMetricBlock(output: string, metricName: string): string | undefined {
	const lines = output.split('\n')
	const blocks: string[][] = []
	let current: string[] | undefined

	for (const line of lines) {
		if (line.startsWith('# HELP ') || line.startsWith('# TYPE ')) {
			if (current) blocks.push(current)
			current = [line]
		} else if (line.startsWith(metricName)) {
			if (current) current.push(line)
		}
	}
	if (current) blocks.push(current)
	return blocks.find((block) => block.some((l) => l.startsWith(metricName)))?.join('\n')
}

// ── Counter ─────────────────────────────────────────────────────────────

describe('Counter', () => {
	it('starts at zero and increments by one', () => {
		const counter = new Counter('test_count', 'a test counter')
		expect(counter.get()).toBe(0)
		counter.inc()
		expect(counter.get()).toBe(1)
		counter.inc()
		expect(counter.get()).toBe(2)
	})

	it('increments by a custom amount', () => {
		const counter = new Counter('test_count', 'a test counter')
		counter.inc(5)
		expect(counter.get()).toBe(5)
	})

	it('tracks multiple label sets independently', () => {
		const counter = new Counter('jobs_total', 'total jobs', ['workerId'])
		counter.inc(1, { workerId: 'w1' })
		counter.inc(2, { workerId: 'w1' })
		counter.inc(1, { workerId: 'w2' })
		expect(counter.get({ workerId: 'w1' })).toBe(3)
		expect(counter.get({ workerId: 'w2' })).toBe(1)
	})

	it('renders Prometheus text exposition', () => {
		const counter = new Counter('tasks_total', 'total tasks created', ['module'])
		counter.inc(2, { module: 'code' })
		counter.inc(1, { module: 'core' })

		const output = counter.expose()
		expect(output).toContain('# HELP tasks_total total tasks created')
		expect(output).toContain('# TYPE tasks_total counter')
		expect(output).toContain('tasks_total{module="code"} 2')
		expect(output).toContain('tasks_total{module="core"} 1')
	})

	it('values accumulate monotonically', () => {
		const counter = new Counter('x', 'desc')
		counter.inc()
		counter.inc()
		expect(counter.get()).toBe(2)
	})
})

// ── Gauge ──────────────────────────────────────────────────────────────

describe('Gauge', () => {
	it('starts at zero and can go positive or negative', () => {
		const gauge = new Gauge('test_gauge', 'a test gauge')
		expect(gauge.get()).toBe(0)
		gauge.inc(3)
		expect(gauge.get()).toBe(3)
		gauge.dec(5)
		expect(gauge.get()).toBe(-2)
	})

	it('set() overrides the value', () => {
		const gauge = new Gauge('test_gauge', 'a test gauge')
		gauge.set(10)
		expect(gauge.get()).toBe(10)
		gauge.set(-3)
		expect(gauge.get()).toBe(-3)
	})

	it('tracks multiple label sets independently', () => {
		const gauge = new Gauge('workers_active', 'active worker processes', ['pool'])
		gauge.set(2, { pool: 'main' })
		gauge.set(0, { pool: 'aux' })
		expect(gauge.get({ pool: 'main' })).toBe(2)
		expect(gauge.get({ pool: 'aux' })).toBe(0)
	})

	it('renders Prometheus text exposition', () => {
		const gauge = new Gauge('queue_size', 'pending tasks in queue')
		gauge.set(42)

		const output = gauge.expose()
		expect(output).toContain('# HELP queue_size pending tasks in queue')
		expect(output).toContain('# TYPE queue_size gauge')
		expect(output).toContain('queue_size 42')
	})
})

// ── Histogram ───────────────────────────────────────────────────────────

describe('Histogram', () => {
	it('counts observations across monotonically-increasing buckets', () => {
		const histogram = new Histogram('task_duration', 'task duration in ms', {
			buckets: [100, 500, 1000],
		})
		histogram.observe(50)  // falls in 100, 500, 1000
		histogram.observe(99)
		histogram.observe(500) // falls in 500, 1000 (not in 100)
		histogram.observe(2000) // falls in none of the finite buckets

		const snapshot = histogram.entries()[0]
		expect(snapshot.count).toBe(4)
		expect(snapshot.sum).toBe(2649)
		// Observations: 50, 99, 500, 2000.
		// Cumulative bucket counts: ≤100=2, ≤500=3, ≤1000=3 (2000 is +Inf only).
		expect(snapshot.buckets.find((b) => b.upperBound === 100)?.count).toBe(2)
		expect(snapshot.buckets.find((b) => b.upperBound === 500)?.count).toBe(3)
		expect(snapshot.buckets.find((b) => b.upperBound === 1000)?.count).toBe(3)
	})

	it('renders Prometheus histogram text exposition', () => {
		const histogram = new Histogram('task_duration', 'task duration', {
			buckets: [100, 500],
			labelKeys: ['module'],
		})
		histogram.observe(30, { module: 'code' })
		histogram.observe(200, { module: 'core' })

		const output = histogram.expose()
		expect(output).toContain('# HELP task_duration task duration')
		expect(output).toContain('# TYPE task_duration histogram')
		expect(output).toContain('task_duration_bucket{module="code",bucket="100"} 1')
		expect(output).toContain('task_duration_bucket{module="code",bucket="+Inf"} 1')
		expect(output).toContain('task_duration_bucket{module="core",bucket="100"} 0')
		expect(output).toContain('task_duration_bucket{module="core",bucket="500"} 1')
		expect(output).toContain('task_duration_bucket{module="core",bucket="+Inf"} 1')
		expect(output).toContain('task_duration_sum{module="core"} 200')
		expect(output).toContain('task_duration_count{module="core"} 1')
	})

	it('sorts buckets when constructed out-of-order', () => {
		const histogram = new Histogram('x', 'd', {
			buckets: [500, 100, 250],
		})
		histogram.observe(150)
		const snapshot = histogram.entries()[0]
		// Buckets should be in ascending order for cumulative counting.
		expect(snapshot.buckets.map((b) => b.upperBound)).toEqual([100, 250, 500])
	})
})

// ── Registry ─────────────────────────────────────────────────────────────

describe('MetricRegistry', () => {
	it('aggregates counters and renders them together', () => {
		const registry = new MetricRegistry()
		const a = registry.createCounter('a_total', 'desc a')
		const b = registry.createCounter('b_total', 'desc b')
		a.inc(3)
		b.inc(7)

		const output = registry.expose()
		expect(output).toContain('a_total 3')
		expect(output).toContain('b_total 7')
	})

	it('snapshot returns structured data', () => {
		const registry = new MetricRegistry()
		const counter = registry.createCounter('x_total', 'desc')
		counter.inc(5)

		const snapshot = registry.snapshot()
		expect(snapshot).toHaveLength(1)
		expect(snapshot[0].name).toBe('x_total')
		expect(snapshot[0].type).toBe('counter')
	})

	it('createGauge and createHistogram work', () => {
		const registry = new MetricRegistry()
		const gauge = registry.createGauge('active_workers', 'active worker count')
		gauge.set(2)

		const hist = registry.createHistogram('op_duration', 'operation duration')
		hist.observe(42)

		const output = registry.expose()
		expect(output).toContain('active_workers 2')
		expect(output).toContain('op_duration_bucket')
	})

	it('register is idempotent for the same instance', () => {
		const registry = new MetricRegistry()
		const counter = registry.createCounter('x_total', 'desc')
		registry.register(counter) // register again — should be deduplicated
		counter.inc()

		const output = registry.expose()
		// Should appear only once in output.
		const occurrences = output.split('\n').filter((l) => l.startsWith('x_total ')).length
		expect(occurrences).toBe(1)
	})
})

// ── Default registry ───────────────────────────────────────────────────

describe('default registry', () => {
	afterEach(() => resetDefaultRegistry())

	it('returns the same instance on repeated calls', () => {
		const a = getDefaultRegistry()
		const b = getDefaultRegistry()
		expect(a).toBe(b)
	})

	it('can be reset and re-created', () => {
		const a = getDefaultRegistry()
		resetDefaultRegistry()
		const b = getDefaultRegistry()
		expect(a).not.toBe(b)
	})
})

// ── Label escaping ──────────────────────────────────────────────────────

describe('escapeLabelValue', () => {
	it('escapes backslashes and double-quotes', () => {
		expect(escapeLabelValue('say "hi"')).toBe('say \\"hi\\"')
		expect(escapeLabelValue('a\\b')).toBe('a\\\\b')
		expect(escapeLabelValue('plain')).toBe('plain')
	})
})

// ── Integration: wiring sanity ─────────────────────────────────────────

describe('instrumentation wiring sanity', () => {
	it('grows monotonically across many state transitions', () => {
		const registry = new MetricRegistry()
		const starts = registry.createCounter('task_starts', 'tasks that entered running state')
		const queueSize = registry.createGauge('queue_size', 'tasks queued', ['module'])
		const duration = registry.createHistogram('task_duration_ms', 'task duration', {
			labelKeys: ['module'],
			buckets: [50, 100, 500],
		})

		queueSize.set(5, { module: 'code' }) // 5 tasks waiting

		// Simulate 5 tasks from module "code" each taking 75ms.
		for (let i = 0; i < 5; i += 1) {
			starts.inc()
			queueSize.dec(1, { module: 'code' })
			duration.observe(75, { module: 'code' })
		}

		expect(starts.get()).toBe(5)
		expect(queueSize.get({ module: 'code' })).toBe(0)
		const snap = duration.entries()[0]
		expect(snap.count).toBe(5)
		// 75ms observations are > 50ms but ≤ 100ms and ≤ 500ms.
		expect(snap.buckets.find((b) => b.upperBound === 50)?.count).toBe(0)
		expect(snap.buckets.find((b) => b.upperBound === 100)?.count).toBe(5)
		expect(snap.buckets.find((b) => b.upperBound === 500)?.count).toBe(5)
	})
})
