import type { StrategyAdvisory } from '../strategy'

import { describe, expect, it } from 'vitest'

import {
  buildPreparatoryExecutionPlan,
  canonicalizeWorkflowPrepToolName,
  resolveWorkflowPrepToolSpec,
} from './prep-tools'

function makeAdvisory(fields: Partial<StrategyAdvisory> & Pick<StrategyAdvisory, 'kind' | 'reason'>): StrategyAdvisory {
  return {
    category: 'prep',
    recommendedSurface: 'none',
    ...fields,
  }
}

describe('prep-tools', () => {
  it('canonicalizes dynamic PTY prep tool names', () => {
    expect(canonicalizeWorkflowPrepToolName('pty_send_input:pty_1:ls -la')).toBe('pty_send_input')
    expect(canonicalizeWorkflowPrepToolName('pty_read_screen:pty_1')).toBe('pty_read_screen')
    expect(canonicalizeWorkflowPrepToolName('pty_destroy:pty_1')).toBe('pty_destroy')
  })

  it('resolves prep tool spec metadata for browser and PTY tools', () => {
    expect(resolveWorkflowPrepToolSpec('browser_dom_read_page')).toMatchObject({
      canonicalName: 'browser_dom_read_page',
      lane: 'browser_dom',
      kind: 'probe',
      concurrencySafe: true,
    })

    expect(resolveWorkflowPrepToolSpec('pty_send_input:pty_1:echo hi')).toMatchObject({
      canonicalName: 'pty_send_input',
      lane: 'pty',
      kind: 'mutation',
      concurrencySafe: false,
    })
  })

  it('keeps reroute prep advisories in sequential batches even when priorities match', () => {
    const batches = buildPreparatoryExecutionPlan([
      makeAdvisory({
        kind: 'use_browser_surface',
        reason: 'browser lane already available',
        suggestedToolName: 'browser_dom_read_page',
      }),
      makeAdvisory({
        kind: 'use_accessibility_grounding',
        reason: 'ax tree can ground the next step',
        suggestedToolName: 'accessibility_snapshot',
      }),
      makeAdvisory({
        kind: 'enumerate_displays_first',
        reason: 'display geometry missing',
        suggestedToolName: 'display_enumerate',
      }),
    ])

    expect(batches).toHaveLength(3)
    expect(batches[0]).toMatchObject({
      priority: 10,
      parallel: true,
    })
    expect(batches[0]?.executions.map(execution => execution.toolName)).toEqual(['display_enumerate'])
    expect(batches[1]).toMatchObject({
      priority: 20,
      parallel: false,
    })
    expect(batches[1]?.executions.map(execution => execution.toolName)).toEqual(['browser_dom_read_page'])
    expect(batches[2]).toMatchObject({
      priority: 20,
      parallel: false,
    })
    expect(batches[2]?.executions.map(execution => execution.toolName)).toEqual(['accessibility_snapshot'])
  })
})
