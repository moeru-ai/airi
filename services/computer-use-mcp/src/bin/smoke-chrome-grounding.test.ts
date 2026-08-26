import { describe, expect, it } from 'vitest'

import {
  extractOverlaySmokeState,
  parseCommandArgs,
  parseNumber,
  parseOptionalString,
  requireChromeDomSmokeCandidate,
  requirePostClickOverlayState,
  requireRunState,
  requireStructuredContent,
  requireTextContent,
  selectDesktopV3SmokeCandidate,
  selectPendingActionForTool,
} from './smoke-chrome-grounding'

describe('smoke-chrome-grounding helpers', () => {
  it('parses server command args with fallback', () => {
    expect(parseCommandArgs(undefined, ['start'])).toEqual(['start'])
    expect(parseCommandArgs(' start -- --flag ', ['fallback'])).toEqual(['start', '--', '--flag'])
  })

  it('parses numbers and optional string sentinels', () => {
    expect(parseNumber(undefined, 12)).toBe(12)
    expect(parseNumber('9.8', 12)).toBe(9)
    expect(parseNumber('foo', 12)).toBe(12)
    expect(parseOptionalString(undefined)).toBeUndefined()
    expect(parseOptionalString(' undefined ')).toBeUndefined()
    expect(parseOptionalString(' null ')).toBeUndefined()
    expect(parseOptionalString(' t_1 ')).toBe('t_1')
  })

  it('requires structured content and text content', () => {
    expect(requireStructuredContent({
      structuredContent: {
        status: 'ok',
      },
    }, 'tool')).toEqual({ status: 'ok' })

    expect(requireTextContent({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', data: 'ignored' },
        { type: 'text', text: 'world' },
      ],
    }, 'tool')).toBe('hello\nworld')

    expect(() => requireStructuredContent({}, 'tool')).toThrow('tool missing structuredContent')
    expect(() => requireTextContent({ content: [] }, 'tool')).toThrow('tool missing text content')
  })

  it('extracts runState from desktop_get_state structured content', () => {
    expect(requireRunState({
      structuredContent: {
        status: 'ok',
        runState: {
          lastClickedCandidateId: 't_0',
        },
      },
    }, 'desktop_get_state')).toEqual({
      lastClickedCandidateId: 't_0',
    })

    expect(() => requireRunState({
      structuredContent: {
        status: 'error',
      },
    }, 'desktop_get_state')).toThrow('desktop_get_state expected status=ok')
  })

  it('selects explicit candidate first and otherwise requires the chrome_dom smoke target label', () => {
    const runState = {
      lastGroundingSnapshot: {
        snapshotId: 'dg_1',
        targetCandidates: [
          {
            id: 't_0',
            source: 'ax',
            role: 'button',
            label: 'Disabled',
            interactable: false,
          },
          {
            id: 't_1',
            source: 'chrome_dom',
            role: 'AXToolbar',
            label: 'Toolbar',
            interactable: true,
          },
          {
            id: 't_2',
            source: 'chrome_dom',
            role: 'AXButton',
            label: 'AIRI Desktop V3 Smoke Button',
            interactable: true,
          },
        ],
      },
    }

    expect(selectDesktopV3SmokeCandidate(runState).id).toBe('t_2')
    expect(selectDesktopV3SmokeCandidate(runState, 't_0').id).toBe('t_0')
    expect(() => selectDesktopV3SmokeCandidate(runState, 'missing')).toThrow('did not return requested candidate')
  })

  it('does not fall back to a generic chrome_dom candidate when the smoke label is missing', () => {
    const runState = {
      lastGroundingSnapshot: {
        snapshotId: 'dg_1',
        targetCandidates: [
          {
            id: 't_0',
            role: 'AXToolbar',
            label: 'Toolbar',
            interactable: true,
          },
          {
            id: 't_1',
            source: 'ax',
            role: 'AXButton',
            label: 'Submit',
            interactable: true,
          },
          {
            id: 't_2',
            source: 'chrome_dom',
            role: 'AXButton',
            label: 'Submit',
            interactable: true,
          },
        ],
      },
    }

    expect(() => selectDesktopV3SmokeCandidate(runState)).toThrow('desktop_observe did not return the AIRI Desktop V3 Smoke Button chrome_dom candidate')
  })

  it('locks pre-click and post-click overlay state shape', () => {
    const runState = {
      lastGroundingSnapshot: {
        snapshotId: 'dg_1',
        targetCandidates: [
          { id: 't_0' },
        ],
        staleFlags: {
          screenshot: false,
          ax: false,
          chromeSemantic: false,
        },
      },
    }

    expect(extractOverlaySmokeState(runState)).toMatchObject({
      hasSnapshot: true,
      snapshotId: 'dg_1',
      candidateCount: 1,
    })

    expect(requirePostClickOverlayState({
      ...runState,
      lastPointerIntent: {
        candidateId: 't_0',
        phase: 'completed',
      },
      lastClickedCandidateId: 't_0',
    }, 't_0')).toMatchObject({
      pointerIntent: {
        candidateId: 't_0',
      },
      lastClickedCandidateId: 't_0',
    })

    expect(() => requirePostClickOverlayState(runState, 't_0')).toThrow('missing lastPointerIntent')
  })

  it('reads chrome_dom routing evidence from desktop_click_target structured content', () => {
    const clickResult = {
      structuredContent: {
        status: 'executed',
        backendResult: {
          executionRoute: 'browser_dom (chrome_dom candidate with selector "#login-btn" routed to browser-dom bridge)',
          routeReason: 'chrome_dom candidate with selector "#login-btn" routed to browser-dom bridge',
        },
      },
    }

    const structured = requireStructuredContent(clickResult, 'desktop_click_target')
    expect(typeof structured.backendResult).toBe('object')
    expect((structured.backendResult as Record<string, unknown>).executionRoute).toContain('browser_dom')
  })

  it('selects pending actions by tool name and fails with a useful message when missing', () => {
    const pendingActions = [
      { toolName: 'desktop_open_app', id: 'p_0' },
      { toolName: 'desktop_click_target', id: 'p_1' },
    ]

    expect(selectPendingActionForTool(pendingActions, 'desktop_click_target').id).toBe('p_1')
    expect(() => selectPendingActionForTool(pendingActions, 'desktop_ensure_chrome')).toThrow('no pending action for desktop_ensure_chrome (found: desktop_open_app, desktop_click_target)')
  })

  it('requires the smoke target to come from chrome_dom', () => {
    expect(() => requireChromeDomSmokeCandidate({
      id: 't_0',
      source: 'ax',
      label: 'Smoke',
    })).toThrow('smoke target button was not captured as a chrome_dom candidate')
  })
})
