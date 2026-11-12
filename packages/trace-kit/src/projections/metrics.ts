import type { TraceMetricDefinition } from '../core/definitions'
import type { TraceRecord } from '../core/types'
import type { MetricSample, MetricSamples, MetricSummary, TraceProjection } from './types'

import { groupBy, mapValues } from 'es-toolkit'

import { aggregate, ATTR_CENSORED, ATTR_WARMUP } from '../conventions'
import { matchTrackPath } from '../core/define'

interface MetricsState {
  definitions: Map<string, TraceMetricDefinition>
  samples: MetricSamples
}

function exclusionOf(record: TraceRecord): MetricSample['excluded'] {
  if (record.attrs?.[ATTR_CENSORED] === true)
    return 'censored'
  if (record.attrs?.[ATTR_WARMUP] === true)
    return 'warmup'
  if (record.type === 'span.end' && record.status !== 'ok')
    return 'failed'
  return undefined
}

/**
 * Collects the samples of metrics of kind `attribute`.
 *
 * A metric definition record names a track pattern, a record type, and an attribute. Each matching record with a number
 * value adds one sample. A metric of kind `derived` comes from its own projection.
 */
export function createAttributeMetricsProjection(): TraceProjection<MetricsState, MetricSamples> {
  return {
    key: 'metrics.attribute',
    reset: () => ({ definitions: new Map(), samples: {} }),
    handleRecord(state, record, context) {
      if (record.type === 'definition') {
        if (record.kind === 'metric') {
          const definition = record.data as TraceMetricDefinition
          if (definition.value.kind === 'attribute')
            state.definitions.set(definition.key, definition)
        }
        return state
      }
      if (!('track' in record) || !record.attrs)
        return state

      for (const definition of state.definitions.values()) {
        const source = definition.value
        if (source.kind !== 'attribute' || source.record !== record.type)
          continue
        const params = matchTrackPath(source.track, record.track)
        const value = record.attrs[source.attribute]
        if (!params || typeof value !== 'number')
          continue
        const dimensions = definition.dimensions
          ? Object.fromEntries(definition.dimensions.map(key => [key, String(record.ids?.[key] ?? params[key] ?? '')]))
          : undefined
        const list = state.samples[definition.key] ??= []
        list.push({ time: context.time, value, dimensions, excluded: exclusionOf(record) })
      }
      return state
    },
    evict(state, range) {
      for (const [key, list] of Object.entries(state.samples)) {
        if (state.definitions.get(key)?.scope === 'session')
          continue
        state.samples[key] = list.filter(sample => sample.time > range.to)
      }
      return state
    },
    select: state => state.samples,
  }
}

/** Summarizes samples with the aggregates of their definition. The default aggregates are p50 and p95. */
export function summarizeMetric(key: string, samples: readonly MetricSample[], definition?: TraceMetricDefinition): MetricSummary {
  const kinds = definition?.aggregate ?? ['p50', 'p95']
  const included = samples.filter(sample => !sample.excluded)
  const excluded = { censored: 0, warmup: 0, failed: 0 }
  for (const sample of samples) {
    if (sample.excluded)
      excluded[sample.excluded]++
  }

  let byDimension: MetricSummary['byDimension']
  if (definition?.dimensions?.length) {
    const dimensions = definition.dimensions
    const groups = groupBy(included, sample => dimensions.map(dimension => sample.dimensions?.[dimension] ?? '').join('|'))
    byDimension = mapValues(groups, group => aggregate(group.map(sample => sample.value), kinds))
  }

  return {
    key,
    definition,
    values: aggregate(included.map(sample => sample.value), kinds),
    count: included.length,
    excluded,
    byDimension,
  }
}
