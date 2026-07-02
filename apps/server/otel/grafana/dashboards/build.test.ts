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

  /**
   * @example
   * expect(panelTitle('panel-99')).toBe('TTS Success %')
   */
  it('keeps the product analytics row focused on server-side TTS health', () => {
    expect(panelTitle('panel-95')).toBe('Product Events (range)')
    expect(panelTitle('panel-96')).toBe('Product Failure %')
    expect(panelTitle('panel-99')).toBe('TTS Success %')
    expect(panelTitle('panel-100')).toBe('TTS Failed / Blocked (range)')
    expect(panelTitle('panel-101')).toBe('TTS Event Rate by Source')
    expect(panelTitle('panel-102')).toBe('TTS Blocked by Reason')
    expect(panelTitle('panel-103')).toBe('TTS Blocked by Flux Bucket')
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
      dashboard.elements['panel-100'],
      dashboard.elements['panel-101'],
      dashboard.elements['panel-102'],
      dashboard.elements['panel-103'],
    ]).join('\n')

    expect(productPanelExpressions).not.toContain('voice_id')
    expect(productPanelExpressions).not.toContain('voice_pack_id')
    expect(productPanelExpressions).not.toContain('user_id')
    expect(productPanelExpressions).not.toContain('session_id')
    expect(productPanelExpressions).not.toContain('request_id')
  })
})
