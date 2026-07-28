import { describe, expect, it } from 'vitest'

import { checkDashboardLayoutReferences, dashboard } from './build'

/**
 * Narrows unknown dashboard nodes into indexable records for assertions.
 */
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object')
    throw new TypeError(`${label} is not an object`)

  return value as Record<string, unknown>
}

/**
 * Reads a generated panel title from the dashboard object.
 */
function panelTitle(panelName: string): string {
  const panel = asRecord(dashboard.elements[panelName], panelName)
  const spec = asRecord(panel.spec, `${panelName}.spec`)
  if (typeof spec.title !== 'string')
    throw new TypeError(`${panelName}.spec.title is not a string`)

  return spec.title
}

/**
 * Collects PromQL expression strings from nested Grafana panel objects.
 */
function collectQueryExpressions(value: unknown, expressions: string[] = []): string[] {
  if (!value || typeof value !== 'object')
    return expressions

  const record = value as Record<string, unknown>
  if (typeof record.expr === 'string')
    expressions.push(record.expr)

  for (const nestedValue of Object.values(record))
    collectQueryExpressions(nestedValue, expressions)

  return expressions
}

describe('grafana dashboard builder', () => {
  /**
   * @example
   * const result = checkDashboardLayoutReferences(dashboard)
   * expect(result.orphanRefs).toEqual([])
   */
  it('keeps every generated panel connected to the row layout', () => {
    const result = checkDashboardLayoutReferences(dashboard)

    expect(result.orphanRefs).toEqual([])
    expect(result.unusedElems).toEqual([])
  })

  it('keeps the product analytics row focused on Prometheus-safe engagement signals', () => {
    expect(panelTitle('panel-95')).toBe('Product Events (range)')
    expect(panelTitle('panel-96')).toBe('Product Failure %')
    expect(panelTitle('panel-97')).toBe('Top Product Actions (range)')
    expect(panelTitle('panel-98')).toBe('Product Event Rate')
    expect(panelTitle('panel-99')).toBe('DAU Trend')
  })

  /**
   * @example
   * const rendered = JSON.stringify(dashboard.elements['panel-101'])
   * expect(rendered).not.toContain('voice_id')
   */
  it('keeps high-cardinality voice fields out of Prometheus queries', () => {
    const productPanelExpressions = collectQueryExpressions([
      dashboard.elements['panel-95'],
      dashboard.elements['panel-96'],
      dashboard.elements['panel-97'],
      dashboard.elements['panel-98'],
      dashboard.elements['panel-99'],
    ]).join('\n')

    expect(productPanelExpressions).not.toContain('voice_id')
    expect(productPanelExpressions).not.toContain('voice_pack_id')
    expect(productPanelExpressions).not.toContain('user_id')
    expect(productPanelExpressions).not.toContain('session_id')
    expect(productPanelExpressions).not.toContain('request_id')
  })

  it('preserves histogram buckets until HTTP and LLM latency quantiles are calculated', () => {
    // ROOT CAUSE:
    //
    // The latency panels previously summed cumulative `_bucket` rates after
    // dropping `le`. Grafana then labelled that request-rate-derived value as
    // seconds, making millisecond HTTP routes appear to take 20+ seconds.
    //
    // Quantiles must retain `le` while replicas are merged, then call
    // histogram_quantile over the merged histogram.
    const httpLatency = collectQueryExpressions(dashboard.elements['panel-20']).join('\n')
    const llmLatency = collectQueryExpressions(dashboard.elements['panel-21']).join('\n')

    expect(httpLatency).toContain('histogram_quantile(0.95')
    expect(httpLatency).toContain('sum by (le, http_route)')
    expect(llmLatency.match(/histogram_quantile\(0\.95/g)).toHaveLength(2)
    expect(llmLatency).toContain('gen_ai_client_first_token_duration_seconds_bucket')
    expect(llmLatency).toContain('sum by (le)')
  })

  it('does not clamp rate denominators to one request per second', () => {
    // ROOT CAUSE:
    //
    // `clamp_min(rate, 1)` changes the denominator whenever traffic is below
    // 1 req/s, so low-volume provider and fallback failures are underreported.
    for (const panelName of ['panel-4', 'panel-62', 'panel-68']) {
      const expressions = collectQueryExpressions(dashboard.elements[panelName]).join('\n')

      expect(expressions).not.toContain('clamp_min')
    }
  })

  it('uses visualizations and reductions that match each query shape', () => {
    const statusPanel = JSON.stringify(dashboard.elements['panel-40'])
    const modelMixPanel = JSON.stringify(dashboard.elements['panel-11'])

    expect(statusPanel).toContain('"group":"timeseries"')
    expect(statusPanel).not.toContain('"group":"heatmap"')
    expect(modelMixPanel).toContain('increase(')
    expect(modelMixPanel).toContain('"instant":true')
    expect(modelMixPanel).toContain('"calcs":["lastNotNull"]')
  })

  it('filters structured Loki severity without parsing plain-text bodies as JSON', () => {
    const errorLogsPanel = JSON.stringify(dashboard.elements['panel-91'])

    expect(panelTitle('panel-91')).toBe('Warn / Error Logs')
    expect(errorLogsPanel).toContain('detected_level=~\\"warn|error\\"')
    expect(errorLogsPanel).not.toContain('| json')
  })

  it('keeps one DAU visualization and refreshes the operations dashboard', () => {
    expect(dashboard.elements['panel-80']).toBeUndefined()
    expect(panelTitle('panel-99')).toBe('DAU Trend')
    expect(dashboard.timeSettings.autoRefresh).toBe('30s')
  })

  it('queries cluster-wide distinct online websocket users as an instant value', () => {
    // ROOT CAUSE:
    //
    // Counting WebSocket contexts measures tabs/connections, not people. The
    // online-user gauge counts unique Redis broadcast channels cluster-wide,
    // and every replica reports that same shared value.
    const wsOnlinePanel = JSON.stringify(dashboard.elements['panel-93'])

    expect(panelTitle('panel-93')).toBe('Online Users')
    expect(wsOnlinePanel).toContain('max(ws_users_online')
    expect(wsOnlinePanel).not.toContain('ws_connections_active')
    expect(wsOnlinePanel).toContain('"instant":true')
    expect(wsOnlinePanel).toContain('"range":false')
  })
})
