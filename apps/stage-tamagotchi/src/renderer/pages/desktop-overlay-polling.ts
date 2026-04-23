/**
 * Desktop Overlay Polling — pure logic for MCP state polling and data extraction.
 *
 * Extracted from desktop-overlay.vue so the core logic can be tested
 * without a DOM environment or Vue test-utils.
 */

import type { McpCallToolResult } from '@proj-airi/stage-ui/tools/mcp'

// ---------------------------------------------------------------------------
// Types — minimal shapes matching RunState fields the overlay consumes
// ---------------------------------------------------------------------------

export interface OverlayTargetCandidate {
  id: string
  source: string
  role: string
  label: string
  bounds: { x: number, y: number, width: number, height: number }
  confidence: number
}

export interface OverlayPointerIntent {
  snappedPoint: { x: number, y: number }
  candidateId?: string
  source: string
  confidence: number
  mode: string
}

export interface OverlayStaleFlags {
  screenshot: boolean
  ax: boolean
  chromeSemantic: boolean
}

export interface OverlayState {
  hasSnapshot: boolean
  snapshotId: string
  candidates: OverlayTargetCandidate[]
  staleFlags: OverlayStaleFlags
  pointerIntent: OverlayPointerIntent | null
}

// ---------------------------------------------------------------------------
// State extraction
// ---------------------------------------------------------------------------

const EMPTY_STALE: OverlayStaleFlags = { screenshot: false, ax: false, chromeSemantic: false }

/**
 * Create a default empty overlay state.
 */
export function createEmptyOverlayState(): OverlayState {
  return {
    hasSnapshot: false,
    snapshotId: '',
    candidates: [],
    staleFlags: { ...EMPTY_STALE },
    pointerIntent: null,
  }
}

/**
 * Extract overlay-relevant data from MCP runState.
 * Returns a new OverlayState — does not mutate input.
 *
 * This is the single source of truth for "what does the overlay show?"
 */
export function extractOverlayState(runState: Record<string, unknown>): OverlayState {
  const result = createEmptyOverlayState()

  // Extract grounding snapshot
  const snapshot = runState.lastGroundingSnapshot as Record<string, unknown> | undefined
  if (snapshot) {
    result.hasSnapshot = true
    result.snapshotId = (snapshot.snapshotId as string) || ''
    result.candidates = (snapshot.targetCandidates as OverlayTargetCandidate[]) ?? []
    result.staleFlags = (snapshot.staleFlags as OverlayStaleFlags) ?? { ...EMPTY_STALE }
  }

  // Extract pointer intent
  const rawIntent = runState.lastPointerIntent as OverlayPointerIntent | undefined
  result.pointerIntent = rawIntent ?? null

  return result
}

/**
 * Extract runState from an MCP call result.
 * Returns undefined if the result is an error or has no structured content.
 */
export function extractRunStateFromResult(result: McpCallToolResult): Record<string, unknown> | undefined {
  if (result.isError)
    return undefined

  const sc = result.structuredContent
  if (!sc || typeof sc !== 'object')
    return undefined

  // desktop_get_state returns { runState: { ... } } or the state directly
  if ('runState' in sc && sc.runState && typeof sc.runState === 'object') {
    return sc.runState as Record<string, unknown>
  }

  return sc as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Polling controller (framework-agnostic)
// ---------------------------------------------------------------------------

export interface OverlayPollController {
  /** Start polling. No-op if already running. */
  start: () => void
  /** Stop polling. */
  stop: () => void
  /** Whether the controller is actively polling. */
  isRunning: () => boolean
}

export interface OverlayPollConfig {
  /** Function to call MCP tool. */
  callTool: (name: string) => Promise<McpCallToolResult>
  /** Callback with extracted state on each successful poll. */
  onState: (state: OverlayState) => void
  /** Normal poll interval in ms. Default: 250. */
  intervalMs?: number
  /** Fallback interval on error in ms. Default: 500. */
  fallbackIntervalMs?: number
  /** Per-call timeout in ms. Default: 5000. Prevents poll loop hang on startup race. */
  callTimeoutMs?: number
  /** How long a timed-out background call occupies a recovery slot before we probe again. */
  hungCallLeaseMs?: number
}

const DEFAULT_INTERVAL = 250
const DEFAULT_FALLBACK_INTERVAL = 500
const DEFAULT_CALL_TIMEOUT = 5000
const DEFAULT_HUNG_CALL_LEASE = 5000
const MAX_BACKGROUND_HUNG_CALLS = 2

/**
 * MCP server name for computer-use-mcp. Matches the key in mcp.json.
 */
export const MCP_TOOL_NAME = 'computer_use::desktop_get_state'

/**
 * Create a polling controller that periodically calls desktop_get_state
 * and extracts overlay state.
 */
export function createOverlayPollController(config: OverlayPollConfig): OverlayPollController {
  const normalInterval = config.intervalMs ?? DEFAULT_INTERVAL
  const fallbackInterval = config.fallbackIntervalMs ?? DEFAULT_FALLBACK_INTERVAL
  const hungCallLeaseMs = config.hungCallLeaseMs ?? DEFAULT_HUNG_CALL_LEASE

  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let inFlightCall: Promise<McpCallToolResult> | null = null
  let backgroundHungSlots: Array<{ expiresAt: number }> = []

  function scheduleNext(nextInterval: number) {
    if (running) {
      timer = setTimeout(poll, nextInterval)
    }
  }

  function pruneHungCallSlots(now: number) {
    backgroundHungSlots = backgroundHungSlots.filter(slot => slot.expiresAt > now)
  }

  async function poll() {
    pruneHungCallSlots(Date.now())

    if (inFlightCall || backgroundHungSlots.length >= MAX_BACKGROUND_HUNG_CALLS) {
      scheduleNext(fallbackInterval)
      return
    }

    let nextInterval = normalInterval
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      // NOTICE: Wrap callTool with a timeout to prevent the poll loop from
      // hanging forever if the eventa invoke never resolves (e.g. during
      // startup when the main-process RPC handlers may not be ready yet).
      // NOTICE: The bridge does not expose abort semantics, so a timed-out
      // call may still be pending in the background. We therefore track
      // timed-out calls as expiring lease slots: the cap bounds how many
      // unrecoverable invokes we tolerate at once, while lease expiry still
      // lets the overlay probe again after a cooling-off window.
      let timedOutSlot: { expiresAt: number } | null = null
      const currentCall = config.callTool(MCP_TOOL_NAME)
      inFlightCall = currentCall
      currentCall.then(() => {
        if (timedOutSlot) {
          backgroundHungSlots = backgroundHungSlots.filter(slot => slot !== timedOutSlot)
        }
        else if (inFlightCall === currentCall) {
          inFlightCall = null
        }
      }, () => {
        if (timedOutSlot) {
          backgroundHungSlots = backgroundHungSlots.filter(slot => slot !== timedOutSlot)
        }
        else if (inFlightCall === currentCall) {
          inFlightCall = null
        }
      })

      const result = await Promise.race([
        currentCall,
        new Promise<never>((_, reject) =>
          timeoutId = setTimeout(() => {
            timedOutSlot = {
              expiresAt: Date.now() + hungCallLeaseMs,
            }
            backgroundHungSlots = [...backgroundHungSlots, timedOutSlot]
            if (inFlightCall === currentCall) {
              inFlightCall = null
            }
            reject(new Error('callTool timeout'))
          }, config.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT),
        ),
      ])
      const runState = extractRunStateFromResult(result)

      if (runState) {
        config.onState(extractOverlayState(runState))
      }
      else {
        nextInterval = fallbackInterval
      }
    }
    catch {
      // MCP server not running, bridge disconnected, or timeout — graceful degradation
      nextInterval = fallbackInterval
    }
    finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }

    scheduleNext(nextInterval)
  }

  return {
    start() {
      if (running)
        return
      running = true
      // Start first poll immediately
      poll()
    },

    stop() {
      running = false
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },

    isRunning() {
      return running
    },
  }
}
