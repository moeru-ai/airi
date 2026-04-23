import type { McpCallToolResult } from '@proj-airi/stage-ui/tools/mcp'

import type { OverlayState } from './desktop-overlay-polling'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createEmptyOverlayState,
  createOverlayPollController,
  extractOverlayState,
  extractRunStateFromResult,
  MCP_TOOL_NAME,
} from './desktop-overlay-polling'

// ---------------------------------------------------------------------------
// extractOverlayState
// ---------------------------------------------------------------------------

describe('extractOverlayState', () => {
  it('returns empty state when runState has no grounding data', () => {
    const result = extractOverlayState({})
    expect(result.hasSnapshot).toBe(false)
    expect(result.snapshotId).toBe('')
    expect(result.candidates).toEqual([])
    expect(result.pointerIntent).toBeNull()
    expect(result.staleFlags).toEqual({ screenshot: false, ax: false, chromeSemantic: false })
  })

  it('extracts candidates from lastGroundingSnapshot', () => {
    const result = extractOverlayState({
      lastGroundingSnapshot: {
        snapshotId: 'dg_42',
        targetCandidates: [
          { id: 't_0', source: 'chrome_dom', role: 'button', label: 'Submit', bounds: { x: 100, y: 200, width: 80, height: 30 }, confidence: 0.95 },
          { id: 't_1', source: 'ax', role: 'link', label: 'Help', bounds: { x: 300, y: 100, width: 40, height: 20 }, confidence: 0.7 },
        ],
        staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
      },
    })

    expect(result.hasSnapshot).toBe(true)
    expect(result.snapshotId).toBe('dg_42')
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0].id).toBe('t_0')
    expect(result.candidates[1].source).toBe('ax')
  })

  it('extracts pointer intent from lastPointerIntent', () => {
    const result = extractOverlayState({
      lastPointerIntent: {
        snappedPoint: { x: 140, y: 215 },
        candidateId: 't_0',
        source: 'chrome_dom',
        confidence: 0.95,
        mode: 'execute',
      },
    })

    expect(result.pointerIntent).not.toBeNull()
    expect(result.pointerIntent!.snappedPoint).toEqual({ x: 140, y: 215 })
    expect(result.pointerIntent!.candidateId).toBe('t_0')
    expect(result.pointerIntent!.mode).toBe('execute')
  })

  it('detects stale flags', () => {
    const result = extractOverlayState({
      lastGroundingSnapshot: {
        snapshotId: 'dg_1',
        targetCandidates: [],
        staleFlags: { screenshot: true, ax: false, chromeSemantic: true },
      },
    })

    expect(result.staleFlags.screenshot).toBe(true)
    expect(result.staleFlags.ax).toBe(false)
    expect(result.staleFlags.chromeSemantic).toBe(true)
  })

  it('handles snapshot with missing targetCandidates gracefully', () => {
    const result = extractOverlayState({
      lastGroundingSnapshot: {
        snapshotId: 'dg_1',
        // targetCandidates intentionally missing
      },
    })

    expect(result.hasSnapshot).toBe(true)
    expect(result.candidates).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// extractRunStateFromResult
// ---------------------------------------------------------------------------

describe('extractRunStateFromResult', () => {
  it('returns undefined for error results', () => {
    const result = extractRunStateFromResult({
      isError: true,
      content: [{ type: 'text', text: 'fail' }],
    })
    expect(result).toBeUndefined()
  })

  it('extracts runState from structuredContent.runState', () => {
    const result = extractRunStateFromResult({
      structuredContent: {
        runState: {
          lastGroundingSnapshot: { snapshotId: 'dg_1' },
        },
      },
    })
    expect(result).toBeDefined()
    expect((result as any).lastGroundingSnapshot.snapshotId).toBe('dg_1')
  })

  it('falls back to structuredContent directly when no runState key', () => {
    const result = extractRunStateFromResult({
      structuredContent: {
        lastGroundingSnapshot: { snapshotId: 'dg_2' },
      },
    })
    expect(result).toBeDefined()
    expect((result as any).lastGroundingSnapshot.snapshotId).toBe('dg_2')
  })

  it('returns undefined when structuredContent is missing', () => {
    const result = extractRunStateFromResult({})
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// createEmptyOverlayState
// ---------------------------------------------------------------------------

describe('createEmptyOverlayState', () => {
  it('returns consistent empty shape', () => {
    const a = createEmptyOverlayState()
    const b = createEmptyOverlayState()

    expect(a).toEqual(b)
    expect(a.hasSnapshot).toBe(false)
    expect(a.candidates).toEqual([])
    expect(a.pointerIntent).toBeNull()

    // Should not be the same reference (no shared mutation)
    a.candidates.push({ id: 'x', source: 'raw', role: 'button', label: 'X', bounds: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1 })
    expect(b.candidates).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// createOverlayPollController
// ---------------------------------------------------------------------------

describe('createOverlayPollController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls tool and delivers state on successful poll', async () => {
    vi.useFakeTimers()

    const mockResult: McpCallToolResult = {
      structuredContent: {
        runState: {
          lastGroundingSnapshot: {
            snapshotId: 'dg_poll',
            targetCandidates: [
              { id: 't_0', source: 'chrome_dom', role: 'button', label: 'OK', bounds: { x: 10, y: 20, width: 50, height: 25 }, confidence: 0.9 },
            ],
            staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
          },
        },
      },
    }

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockResolvedValue(mockResult)

    const received: OverlayState[] = []

    const controller = createOverlayPollController({
      callTool,
      onState: (s) => { received.push(s) },
      intervalMs: 100,
      fallbackIntervalMs: 200,
    })

    controller.start()

    // Let the first poll resolve
    await vi.advanceTimersByTimeAsync(0)

    expect(callTool).toHaveBeenCalledWith(MCP_TOOL_NAME)
    expect(received).toHaveLength(1)
    expect(received[0].hasSnapshot).toBe(true)
    expect(received[0].candidates[0].id).toBe('t_0')

    controller.stop()
  })

  it('clears the per-call timeout when the tool resolves before the timeout fires', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockResolvedValue({ structuredContent: {} })

    const controller = createOverlayPollController({
      callTool,
      onState: () => {},
      intervalMs: 100,
      callTimeoutMs: 500,
    })

    controller.start()
    await vi.advanceTimersByTimeAsync(0)

    // Only the next poll should remain scheduled. The per-call timeout must be cleared.
    expect(vi.getTimerCount()).toBe(1)

    controller.stop()
  })

  it('stops polling after stop() is called', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockResolvedValue({ structuredContent: {} })

    const controller = createOverlayPollController({
      callTool,
      onState: () => {},
      intervalMs: 100,
    })

    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)

    controller.stop()
    expect(controller.isRunning()).toBe(false)

    // Advance past when next poll would have fired
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(1) // No additional calls
  })

  it('continues polling after a single failure', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockRejectedValueOnce(new Error('MCP down'))
      .mockResolvedValue({
        structuredContent: {
          runState: {
            lastGroundingSnapshot: {
              snapshotId: 'dg_recover',
              targetCandidates: [],
              staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
            },
          },
        },
      })

    const received: OverlayState[] = []

    const controller = createOverlayPollController({
      callTool,
      onState: (s) => { received.push(s) },
      intervalMs: 100,
      fallbackIntervalMs: 200,
    })

    controller.start()

    // First poll: fails
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(received).toHaveLength(0)

    // Wait for fallback interval
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(2)
    expect(received).toHaveLength(1)
    expect(received[0].snapshotId).toBe('dg_recover')

    controller.stop()
  })

  it('is a no-op to call start() twice', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockResolvedValue({ structuredContent: {} })

    const controller = createOverlayPollController({
      callTool,
      onState: () => {},
      intervalMs: 100,
    })

    controller.start()
    controller.start() // Should not double-start

    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1) // Not 2

    controller.stop()
  })

  it('recovers from a hanging callTool via per-call timeout', async () => {
    vi.useFakeTimers()

    let resolveFirstCall: ((value: McpCallToolResult) => void) | null = null

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockImplementationOnce(() => new Promise<McpCallToolResult>((resolve) => {
        resolveFirstCall = resolve
      }))
      .mockResolvedValue({
        structuredContent: {
          runState: {
            lastGroundingSnapshot: {
              snapshotId: 'dg_after_timeout',
              targetCandidates: [],
              staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
            },
          },
        },
      })

    const received: OverlayState[] = []

    const controller = createOverlayPollController({
      callTool,
      onState: (s) => { received.push(s) },
      intervalMs: 100,
      fallbackIntervalMs: 200,
      callTimeoutMs: 500,
    })

    controller.start()

    // First poll fires immediately, callTool hangs
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(received).toHaveLength(0)

    // Advance past the timeout and several fallback windows. The controller
    // should not start a second MCP invoke while the first one is still hung.
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(600)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(received).toHaveLength(0)

    // Once the original call finally settles, the next fallback tick can issue
    // a fresh poll and recover normally.
    if (resolveFirstCall) {
      resolveFirstCall({
        structuredContent: {
          runState: {
            lastGroundingSnapshot: {
              snapshotId: 'dg_late_settle',
              targetCandidates: [],
              staleFlags: { screenshot: false, ax: false, chromeSemantic: false },
            },
          },
        },
      })
    }
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(2)
    expect(received).toHaveLength(1)
    expect(received[0].snapshotId).toBe('dg_after_timeout')

    controller.stop()
  })
})
