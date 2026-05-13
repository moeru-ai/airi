/**
 * Desktop Overlay Polling — pure logic for MCP state polling and data extraction.
 *
 * Extracted from desktop-overlay.vue so the core logic can be tested
 * without a DOM environment or Vue test-utils.
 */

import type { McpCallToolResult } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'

import { desktopOverlayPollHeartbeatMarker, desktopOverlayPollHeartbeatQueryParam } from '../../shared/desktop-overlay-heartbeat'

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
  phase?: 'preview' | 'executing' | 'completed'
  executionResult?: 'success' | 'fallback' | 'error'
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
  bootstrapState: 'booting' | 'ready' | 'degraded'
  lastBootstrapError?: string
}

export interface OverlayPollHeartbeat {
  snapshotId: string
  candidateCount: number
  hasPointerIntent: boolean
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
    bootstrapState: 'booting',
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

export function createOverlayPollHeartbeat(state: OverlayState): OverlayPollHeartbeat | undefined {
  if (!state.hasSnapshot || !state.snapshotId)
    return undefined

  return {
    snapshotId: state.snapshotId,
    candidateCount: state.candidates.length,
    hasPointerIntent: state.pointerIntent !== null,
  }
}

export function formatOverlayPollHeartbeat(heartbeat: OverlayPollHeartbeat): string {
  return [
    desktopOverlayPollHeartbeatMarker,
    `snapshotId=${heartbeat.snapshotId}`,
    `candidates=${heartbeat.candidateCount}`,
    `pointerIntent=${heartbeat.hasPointerIntent ? 'yes' : 'no'}`,
  ].join(' ')
}

export function isOverlayPollHeartbeatEnabled(locationLike: Pick<Location, 'hash' | 'search'> = window.location): boolean {
  const hashQuery = locationLike.hash.includes('?')
    ? locationLike.hash.slice(locationLike.hash.indexOf('?') + 1)
    : ''
  const hashParams = new URLSearchParams(hashQuery)
  const searchParams = new URLSearchParams(locationLike.search)

  return hashParams.get(desktopOverlayPollHeartbeatQueryParam) === '1'
    || searchParams.get(desktopOverlayPollHeartbeatQueryParam) === '1'
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
  /** Optional debug-only callback with a small heartbeat marker. */
  onHeartbeat?: (heartbeat: OverlayPollHeartbeat) => void
  /** Function to ping main process readiness contract via Eventa. */
  getReadiness: () => Promise<{ state: 'booting' | 'ready' | 'degraded', error?: string }>
  /** Normal poll interval in ms. Default: 250. */
  intervalMs?: number
  /** Fallback interval on error in ms. Default: 500. */
  fallbackIntervalMs?: number
  /** Per-call timeout in ms. Default: 5000. Prevents poll loop hang on startup race. */
  callTimeoutMs?: number
}

const DEFAULT_INTERVAL = 250
const DEFAULT_FALLBACK_INTERVAL = 500
const DEFAULT_CALL_TIMEOUT = 5000
const MAX_BACKGROUND_HUNG_CALLS = 2
const HUNG_CALL_RECOVERY_INTERVAL_MS = 10_000

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

  let timer: ReturnType<typeof setTimeout> | null = null
  let bootstrapTimer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let inFlightCall: Promise<McpCallToolResult> | null = null
  let backgroundHungCalls: Array<{
    call: Promise<McpCallToolResult>
    timedOutAt: number
  }> = []
  let lastHungRecoveryProbeAt: number | null = null

  let currentBootstrapState: 'booting' | 'ready' | 'degraded' = 'booting'
  let currentBootstrapError: string | undefined

  function scheduleNext(nextInterval: number) {
    if (running) {
      timer = setTimeout(poll, nextInterval)
    }
  }

  function emitEmptyState() {
    const empty = createEmptyOverlayState()
    empty.bootstrapState = currentBootstrapState
    empty.lastBootstrapError = currentBootstrapError
    config.onState(empty)
  }

  function removeHungCall(call: Promise<McpCallToolResult>) {
    backgroundHungCalls = backgroundHungCalls.filter(slot => slot.call !== call)
    if (backgroundHungCalls.length < MAX_BACKGROUND_HUNG_CALLS) {
      lastHungRecoveryProbeAt = null
    }
  }

  function canStartPoll(now: number) {
    if (inFlightCall)
      return false

    if (backgroundHungCalls.length < MAX_BACKGROUND_HUNG_CALLS)
      return true

    if (lastHungRecoveryProbeAt === null) {
      lastHungRecoveryProbeAt = now
      return false
    }

    if ((now - lastHungRecoveryProbeAt) < HUNG_CALL_RECOVERY_INTERVAL_MS)
      return false

    // NOTICE: Eventa does not expose abort semantics for callTool here. If all
    // tracked calls are permanently hung, waiting for settlement also makes the
    // overlay permanently stale. Drop one old tracking slot only after a long
    // recovery interval so the overlay can probe again without returning to a
    // per-poll unbounded RPC backlog.
    backgroundHungCalls = backgroundHungCalls.slice(1)
    lastHungRecoveryProbeAt = now
    return true
  }

  async function bootstrapPoll() {
    try {
      const res = await config.getReadiness()
      currentBootstrapState = res.state
      currentBootstrapError = res.error
    }
    catch (e) {
      currentBootstrapState = 'degraded'
      currentBootstrapError = e instanceof Error ? e.message : String(e)
    }

    if (!running)
      return

    if (currentBootstrapState === 'ready') {
      emitEmptyState()
      poll()
    }
    else {
      emitEmptyState()
      bootstrapTimer = setTimeout(bootstrapPoll, fallbackInterval)
    }
  }

  async function poll() {
    if (!canStartPoll(Date.now())) {
      scheduleNext(fallbackInterval)
      return
    }

    let nextInterval = normalInterval
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      // NOTICE: Wrap callTool with a timeout to prevent the poll loop from
      // hanging forever if the eventa invoke never resolves (e.g. during
      // startup when the main-process RPC handlers may not be ready yet).
      // NOTICE: Eventa does not expose abort semantics here, so a timed-out
      // invoke can still be unresolved in the background. Track timed-out calls
      // and allow only a low-frequency recovery probe when all tracked slots
      // are hung, balancing bounded IPC pressure with eventual overlay recovery.
      let timedOut = false
      const currentCall = config.callTool(MCP_TOOL_NAME)
      inFlightCall = currentCall
      currentCall.then(() => {
        if (timedOut) {
          removeHungCall(currentCall)
        }
        else if (inFlightCall === currentCall) {
          inFlightCall = null
        }
      }, () => {
        if (timedOut) {
          removeHungCall(currentCall)
        }
        else if (inFlightCall === currentCall) {
          inFlightCall = null
        }
      })

      const result = await Promise.race([
        currentCall,
        new Promise<never>((_, reject) =>
          timeoutId = setTimeout(() => {
            timedOut = true
            backgroundHungCalls = [...backgroundHungCalls, {
              call: currentCall,
              timedOutAt: Date.now(),
            }]
            if (inFlightCall === currentCall) {
              inFlightCall = null
            }
            reject(new Error('callTool timeout'))
          }, config.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT),
        ),
      ])
      const runState = extractRunStateFromResult(result)

      if (runState) {
        const state = extractOverlayState(runState)
        state.bootstrapState = currentBootstrapState
        state.lastBootstrapError = currentBootstrapError
        config.onState(state)
        const heartbeat = createOverlayPollHeartbeat(state)
        if (heartbeat && config.onHeartbeat) {
          config.onHeartbeat(heartbeat)
        }
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
      // First handshake with the host before starting actual MCP polling
      bootstrapPoll()
    },

    stop() {
      running = false
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (bootstrapTimer !== null) {
        clearTimeout(bootstrapTimer)
        bootstrapTimer = null
      }
    },

    isRunning() {
      return running
    },
  }
}
