import type { McpCallToolResult } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'

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
    expect(result.staleFlags).toEqual({ ax: false, chromeSemantic: false, screenshot: false })
    expect(result.bootstrapState).toBe('booting')
  })

  it('extracts candidates from lastGroundingSnapshot', () => {
    const result = extractOverlayState({
      lastGroundingSnapshot: {
        snapshotId: 'dg_42',
        staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
        targetCandidates: [
          { bounds: { height: 30, width: 80, x: 100, y: 200 }, confidence: 0.95, id: 't_0', label: 'Submit', role: 'button', source: 'chrome_dom' },
          { bounds: { height: 20, width: 40, x: 300, y: 100 }, confidence: 0.7, id: 't_1', label: 'Help', role: 'link', source: 'ax' },
        ],
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
        candidateId: 't_0',
        confidence: 0.95,
        mode: 'execute',
        snappedPoint: { x: 140, y: 215 },
        source: 'chrome_dom',
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
        staleFlags: { ax: false, chromeSemantic: true, screenshot: true },
        targetCandidates: [],
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
      content: [{ text: 'fail', type: 'text' }],
      isError: true,
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
    expect(a.bootstrapState).toBe('booting')

    // Should not be the same reference (no shared mutation)
    a.candidates.push({ bounds: { height: 10, width: 10, x: 0, y: 0 }, confidence: 1, id: 'x', label: 'X', role: 'button', source: 'raw' })
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
            staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
            targetCandidates: [
              { bounds: { height: 25, width: 50, x: 10, y: 20 }, confidence: 0.9, id: 't_0', label: 'OK', role: 'button', source: 'chrome_dom' },
            ],
          },
        },
      },
    }

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockResolvedValue(mockResult)

    const received: OverlayState[] = []

    const getReadiness = vi.fn().mockResolvedValue({ state: 'ready' })

    const controller = createOverlayPollController({
      callTool,
      fallbackIntervalMs: 200,
      getReadiness,
      intervalMs: 100,
      onState: (s) => { received.push(s) },
    })

    controller.start()

    // Let the first poll resolve
    await vi.advanceTimersByTimeAsync(0)

    expect(callTool).toHaveBeenCalledWith(MCP_TOOL_NAME)
    expect(received).toHaveLength(2)
    expect(received[0].bootstrapState).toBe('ready')
    expect(received[0].hasSnapshot).toBe(false)
    expect(received[1].hasSnapshot).toBe(true)
    expect(received[1].candidates[0].id).toBe('t_0')

    controller.stop()
  })

  it('stops polling after stop() is called', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockResolvedValue({ structuredContent: {} })

    const getReadiness = vi.fn().mockResolvedValue({ state: 'ready' })

    const controller = createOverlayPollController({
      callTool,
      getReadiness,
      intervalMs: 100,
      onState: () => {},
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
              staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
              targetCandidates: [],
            },
          },
        },
      })

    const received: OverlayState[] = []

    const getReadiness = vi.fn().mockResolvedValue({ state: 'ready' })

    const controller = createOverlayPollController({
      callTool,
      fallbackIntervalMs: 200,
      getReadiness,
      intervalMs: 100,
      onState: (s) => { received.push(s) },
    })

    controller.start()

    // First poll: fails (but empty ready state was emitted)
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(received).toHaveLength(1)
    expect(received[0].bootstrapState).toBe('ready')

    // Wait for fallback interval
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(2)
    expect(received).toHaveLength(2)
    expect(received[1].snapshotId).toBe('dg_recover')

    controller.stop()
  })

  it('is a no-op to call start() twice', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockResolvedValue({ structuredContent: {} })

    const getReadiness = vi.fn().mockResolvedValue({ state: 'ready' })

    const controller = createOverlayPollController({
      callTool,
      getReadiness,
      intervalMs: 100,
      onState: () => {},
    })

    controller.start()
    controller.start() // Should not double-start

    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1) // Not 2

    controller.stop()
  })

  it('recovers from a hanging callTool via per-call timeout', async () => {
    vi.useFakeTimers()

    // First call hangs forever (simulates startup race when RPC not ready)
    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockImplementationOnce(() => new Promise(() => {})) // never resolves
      .mockResolvedValue({
        structuredContent: {
          runState: {
            lastGroundingSnapshot: {
              snapshotId: 'dg_after_timeout',
              staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
              targetCandidates: [],
            },
          },
        },
      })

    const received: OverlayState[] = []

    const getReadiness = vi.fn().mockResolvedValue({ state: 'ready' })

    const controller = createOverlayPollController({
      callTimeoutMs: 500,
      callTool,
      fallbackIntervalMs: 200,
      getReadiness,
      intervalMs: 100,
      onState: (s) => { received.push(s) },
    })

    controller.start()

    // First poll fires immediately (emits ready state), callTool hangs
    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(received).toHaveLength(1)

    // Advance past the 500ms timeout → catch triggers, schedules fallback
    await vi.advanceTimersByTimeAsync(500)
    expect(received).toHaveLength(1)

    // Advance past the 200ms fallback interval → second poll fires and succeeds
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(2)
    expect(received).toHaveLength(2)
    expect(received[1].snapshotId).toBe('dg_after_timeout')

    controller.stop()
  })

  it('caps outstanding timed-out polls to avoid unbounded buildup', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockImplementation(() => new Promise<McpCallToolResult>(() => {}))

    const controller = createOverlayPollController({
      callTimeoutMs: 500,
      callTool,
      fallbackIntervalMs: 200,
      getReadiness: vi.fn().mockResolvedValue({ state: 'ready' }),
      intervalMs: 100,
      onState: () => {},
    })

    controller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)
    expect(callTool).toHaveBeenCalledTimes(2)

    controller.stop()
  })

  it('issues a low-frequency recovery probe when all tracked polls are permanently hung', async () => {
    vi.useFakeTimers()

    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockImplementation(() => new Promise<McpCallToolResult>(() => {}))

    const controller = createOverlayPollController({
      callTimeoutMs: 500,
      callTool,
      fallbackIntervalMs: 200,
      getReadiness: vi.fn().mockResolvedValue({ state: 'ready' }),
      intervalMs: 100,
      onState: () => {},
    })

    controller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)
    expect(callTool).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(callTool).toHaveBeenCalledTimes(3)

    controller.stop()
  })

  it('releases timed-out poll slots only when the original promise settles', async () => {
    vi.useFakeTimers()

    let resolveFirst: (value: McpCallToolResult) => void = () => {}
    const callTool = vi.fn<(name: string) => Promise<McpCallToolResult>>()
      .mockImplementationOnce(() => new Promise<McpCallToolResult>((resolve) => {
        resolveFirst = resolve
      }))
      .mockImplementationOnce(() => new Promise<McpCallToolResult>(() => {}))
      .mockResolvedValue({
        structuredContent: {
          runState: {
            lastGroundingSnapshot: {
              snapshotId: 'dg_after_lease',
              staleFlags: { ax: false, chromeSemantic: false, screenshot: false },
              targetCandidates: [],
            },
          },
        },
      })

    const received: OverlayState[] = []

    const controller = createOverlayPollController({
      callTimeoutMs: 500,
      callTool,
      fallbackIntervalMs: 200,
      getReadiness: vi.fn().mockResolvedValue({ state: 'ready' }),
      intervalMs: 100,
      onState: (state) => {
        received.push(state)
      },
    })

    controller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(received).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1000)
    expect(callTool).toHaveBeenCalledTimes(2)
    expect(received).toHaveLength(1)

    resolveFirst({ structuredContent: {} })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(3)
    expect(received).toHaveLength(2)
    expect(received[1].snapshotId).toBe('dg_after_lease')

    controller.stop()
  })

  it('waits for readiness before entering main poll loop', async () => {
    vi.useFakeTimers()
    const callTool = vi.fn()
    const getReadiness = vi.fn()
      .mockResolvedValueOnce({ state: 'booting' })
      .mockResolvedValueOnce({ state: 'booting' })
      .mockResolvedValueOnce({ state: 'ready' })
    const received: OverlayState[] = []

    const controller = createOverlayPollController({
      callTool,
      fallbackIntervalMs: 200,
      getReadiness,
      intervalMs: 100,
      onState: s => received.push(s),
    })
    controller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).not.toHaveBeenCalled()
    expect(received[0].bootstrapState).toBe('booting')

    // First retry
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).not.toHaveBeenCalled()

    // Second retry triggers ready and immediately polls
    await vi.advanceTimersByTimeAsync(200)
    expect(callTool).toHaveBeenCalledTimes(1)
    expect(received.at(-1)?.bootstrapState).toBe('ready')

    controller.stop()
  })

  it('reports degraded state if getReadiness throws', async () => {
    vi.useFakeTimers()
    const callTool = vi.fn()
    const getReadiness = vi.fn().mockRejectedValue(new Error('RPC failed'))
    const received: OverlayState[] = []

    const controller = createOverlayPollController({
      callTool,
      fallbackIntervalMs: 200,
      getReadiness,
      intervalMs: 100,
      onState: s => received.push(s),
    })
    controller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(callTool).not.toHaveBeenCalled()
    expect(received[0].bootstrapState).toBe('degraded')
    expect(received[0].lastBootstrapError).toBe('RPC failed')

    controller.stop()
  })
})
