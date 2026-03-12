import type { McpCallToolResult } from '../stores/mcp-tool-bridge'

import { describe, expect, it } from 'vitest'

import { formatRerouteObservation } from './mcp-prompt-content'
import { extractWorkflowReroute, isWorkflowReroute } from './mcp-reroute'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRerouteResult(overrides: Record<string, unknown> = {}): McpCallToolResult {
  return {
    structuredContent: {
      kind: 'workflow_reroute',
      status: 'reroute_required',
      workflow: 'workflow_execute_browser',
      reroute: {
        recommendedSurface: 'browser',
        suggestedTool: 'desktop_open',
        strategyReason: 'Browser not running',
        explanation: 'Launch browser first',
      },
      ...overrides,
    },
  }
}

function makeGenericResult(): McpCallToolResult {
  return {
    structuredContent: {
      kind: 'workflow_result',
      status: 'completed',
      workflow: 'workflow_execute_browser',
    },
  }
}

// ---------------------------------------------------------------------------
// extractWorkflowReroute
// ---------------------------------------------------------------------------

describe('extractWorkflowReroute', () => {
  it('extracts reroute from valid structuredContent', () => {
    const instruction = extractWorkflowReroute(makeRerouteResult())
    expect(instruction).toBeDefined()
    expect(instruction!.kind).toBe('workflow_reroute')
    expect(instruction!.status).toBe('reroute_required')
    expect(instruction!.workflow).toBe('workflow_execute_browser')
    expect(instruction!.reroute.recommendedSurface).toBe('browser')
    expect(instruction!.reroute.suggestedTool).toBe('desktop_open')
    expect(instruction!.reroute.strategyReason).toBe('Browser not running')
    expect(instruction!.reroute.explanation).toBe('Launch browser first')
  })

  it('returns undefined for generic workflow_result', () => {
    expect(extractWorkflowReroute(makeGenericResult())).toBeUndefined()
  })

  it('returns undefined when structuredContent is missing', () => {
    expect(extractWorkflowReroute({})).toBeUndefined()
  })

  it('returns undefined when structuredContent is null', () => {
    expect(extractWorkflowReroute({ structuredContent: null })).toBeUndefined()
  })

  it('returns undefined when kind is wrong', () => {
    const result: McpCallToolResult = {
      structuredContent: { kind: 'something_else', status: 'reroute_required', reroute: {} },
    }
    expect(extractWorkflowReroute(result)).toBeUndefined()
  })

  it('returns undefined when reroute field is missing', () => {
    const result: McpCallToolResult = {
      structuredContent: { kind: 'workflow_reroute', status: 'reroute_required' },
    }
    expect(extractWorkflowReroute(result)).toBeUndefined()
  })

  it('includes optional executionReason when present', () => {
    const instruction = extractWorkflowReroute(
      makeRerouteResult({
        reroute: {
          recommendedSurface: 'browser',
          suggestedTool: 'desktop_open',
          strategyReason: 'reason',
          executionReason: 'prep failed: browser not found',
          explanation: 'explain',
        },
      }),
    )
    expect(instruction!.reroute.executionReason).toBe('prep failed: browser not found')
  })

  it('omits executionReason when absent', () => {
    const instruction = extractWorkflowReroute(makeRerouteResult())
    expect(instruction!.reroute).not.toHaveProperty('executionReason')
  })

  it('includes browser-specific fields when present', () => {
    const instruction = extractWorkflowReroute(
      makeRerouteResult({
        reroute: {
          recommendedSurface: 'browser',
          suggestedTool: 'desktop_open',
          strategyReason: 'reason',
          explanation: 'explain',
          availableSurfaces: ['dom', 'cdp'],
          preferredSurface: 'dom',
        },
      }),
    )
    expect(instruction!.reroute.availableSurfaces).toEqual(['dom', 'cdp'])
    expect(instruction!.reroute.preferredSurface).toBe('dom')
  })

  it('omits browser fields when absent', () => {
    const instruction = extractWorkflowReroute(makeRerouteResult())
    expect(instruction!.reroute).not.toHaveProperty('availableSurfaces')
    expect(instruction!.reroute).not.toHaveProperty('preferredSurface')
  })

  it('includes terminal-specific fields when present', () => {
    const instruction = extractWorkflowReroute(
      makeRerouteResult({
        reroute: {
          recommendedSurface: 'pty',
          suggestedTool: 'computer_use::pty_read_screen',
          strategyReason: 'Interactive shell session is already bound to this workflow step.',
          explanation: 'Switch to the bound PTY session before continuing.',
          terminalSurface: 'pty',
          ptySessionId: 'pty_7',
        },
      }),
    )

    expect(instruction!.reroute.terminalSurface).toBe('pty')
    expect(instruction!.reroute.ptySessionId).toBe('pty_7')
  })
})

// ---------------------------------------------------------------------------
// isWorkflowReroute
// ---------------------------------------------------------------------------

describe('isWorkflowReroute', () => {
  it('returns true for valid reroute', () => {
    expect(isWorkflowReroute(makeRerouteResult())).toBe(true)
  })

  it('returns false for generic result', () => {
    expect(isWorkflowReroute(makeGenericResult())).toBe(false)
  })

  it('returns false for empty result', () => {
    expect(isWorkflowReroute({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// formatRerouteObservation
// ---------------------------------------------------------------------------

describe('formatRerouteObservation', () => {
  it('produces single text part with required lines', () => {
    const instruction = extractWorkflowReroute(makeRerouteResult())!
    const parts = formatRerouteObservation(instruction)

    expect(parts).toHaveLength(1)
    expect(parts[0].type).toBe('text')
    const text = (parts[0] as { type: 'text', text: string }).text

    // Header & footer
    expect(text).toContain('Workflow reroute required.')
    expect(text).toContain('Decide the next tool call based on this reroute instruction.')

    // Fields
    expect(text).toContain('Reason: Browser not running')
    expect(text).toContain('Recommended surface: browser')
    expect(text).toContain('Suggested next tool: desktop_open')
  })

  it('includes executionReason line when present', () => {
    const instruction = extractWorkflowReroute(
      makeRerouteResult({
        reroute: {
          recommendedSurface: 'browser',
          suggestedTool: 'desktop_open',
          strategyReason: 'reason',
          executionReason: 'prep failed',
          explanation: 'explain',
        },
      }),
    )!
    const text = (formatRerouteObservation(instruction)[0] as { type: 'text', text: string }).text
    expect(text).toContain('Execution detail: prep failed')
  })

  it('excludes executionReason line when absent', () => {
    const instruction = extractWorkflowReroute(makeRerouteResult())!
    const text = (formatRerouteObservation(instruction)[0] as { type: 'text', text: string }).text
    expect(text).not.toContain('Execution detail:')
  })

  it('includes available/preferred surfaces when present', () => {
    const instruction = extractWorkflowReroute(
      makeRerouteResult({
        reroute: {
          recommendedSurface: 'browser',
          suggestedTool: 'desktop_open',
          strategyReason: 'reason',
          explanation: 'explain',
          availableSurfaces: ['dom', 'cdp'],
          preferredSurface: 'dom',
        },
      }),
    )!
    const text = (formatRerouteObservation(instruction)[0] as { type: 'text', text: string }).text
    expect(text).toContain('Available surfaces: dom, cdp')
    expect(text).toContain('Preferred surface: dom')
  })

  it('excludes surfaces lines when absent', () => {
    const instruction = extractWorkflowReroute(makeRerouteResult())!
    const text = (formatRerouteObservation(instruction)[0] as { type: 'text', text: string }).text
    expect(text).not.toContain('Available surfaces:')
    expect(text).not.toContain('Preferred surface:')
  })

  it('includes terminal surface and PTY session lines when present', () => {
    const instruction = extractWorkflowReroute(
      makeRerouteResult({
        reroute: {
          recommendedSurface: 'pty',
          suggestedTool: 'computer_use::pty_read_screen',
          strategyReason: 'Interactive shell session is already bound to this workflow step.',
          explanation: 'Switch to the bound PTY session before continuing.',
          terminalSurface: 'pty',
          ptySessionId: 'pty_7',
        },
      }),
    )!
    const text = (formatRerouteObservation(instruction)[0] as { type: 'text', text: string }).text
    expect(text).toContain('Terminal surface: pty')
    expect(text).toContain('PTY session id: pty_7')
  })
})
