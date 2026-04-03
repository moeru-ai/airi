/**
 * Detector - Pure functions for sliding window counting
 *
 * All functions are pure: (state, input) => newState
 * No side effects, no mutation
 */

import type { DetectorMode, DetectorState } from './types'

const WINDOW_DURATION_RE = /^(\d+(?:\.\d+)?)(ms|s|m)?$/

/**
 * Default slot duration in milliseconds
 */
export const DEFAULT_SLOT_MS = 20

export interface ProcessDetectorInput {
  readonly threshold: number
  readonly windowMs: number
  readonly mode: DetectorMode
  readonly nowMs: number
  readonly slotMs?: number
}

/**
 * Create a new detector state with empty counts
 * @param windowSlots Number of slots in the sliding window
 * @param nowMs Current timestamp (for pure function compliance)
 */
export function createDetectorState(windowSlots: number, nowMs: number = Date.now()): DetectorState {
  return Object.freeze({
    counts: Object.freeze(Array.from<number>({ length: windowSlots }).fill(0)),
    head: 0,
    total: 0,
    lastUpdateMs: nowMs,
    lastFireSlot: null,
  })
}

/**
 * Calculate how many slots have passed since last update
 */
export function calculateSlotDelta(
  lastUpdateMs: number,
  nowMs: number,
  slotMs: number,
): number {
  const lastSlot = Math.floor(lastUpdateMs / slotMs)
  const currentSlot = Math.floor(nowMs / slotMs)
  return currentSlot - lastSlot
}

/**
 * Advance the detector by N slots (pure function)
 * Zeros out expired slots and adjusts total
 * @param state Current detector state
 * @param slotsToAdvance Number of slots to advance
 * @param slotMs Duration of each slot in milliseconds
 */
export function advanceSlots(
  state: DetectorState,
  slotsToAdvance: number,
  slotMs: number = DEFAULT_SLOT_MS,
): DetectorState {
  if (slotsToAdvance <= 0) {
    return state
  }

  const windowSize = state.counts.length
  const newCounts = [...state.counts]
  let newTotal = state.total
  let newHead = state.head

  // Advance through slots, zeroing out expired data
  const actualAdvance = Math.min(slotsToAdvance, windowSize)
  for (let i = 0; i < actualAdvance; i++) {
    newHead = (newHead + 1) % windowSize
    // Subtract the expired slot from total
    newTotal = Math.max(0, newTotal - (newCounts[newHead] ?? 0))
    // Clear the slot
    newCounts[newHead] = 0
  }

  // If we advanced more than window size, everything is zeroed
  if (slotsToAdvance >= windowSize) {
    newCounts.fill(0)
    newTotal = 0
  }

  return Object.freeze({
    counts: Object.freeze(newCounts),
    head: newHead,
    total: newTotal,
    lastUpdateMs: state.lastUpdateMs + slotsToAdvance * slotMs,
    lastFireSlot: state.lastFireSlot,
  })
}

/**
 * Increment the current slot count (pure function)
 */
export function incrementCount(
  state: DetectorState,
  incrementBy: number = 1,
): DetectorState {
  const newCounts = [...state.counts]
  newCounts[state.head] = (newCounts[state.head] ?? 0) + incrementBy

  return Object.freeze({
    counts: Object.freeze(newCounts),
    head: state.head,
    total: state.total + incrementBy,
    lastUpdateMs: state.lastUpdateMs,
    lastFireSlot: state.lastFireSlot,
  })
}

/**
 * Reset detector after firing (pure function)
 */
export function resetAfterFire(
  state: DetectorState,
  currentSlot: number,
): DetectorState {
  const windowSize = state.counts.length

  return Object.freeze({
    counts: Object.freeze(Array.from<number>({ length: windowSize }).fill(0)),
    head: state.head,
    total: 0,
    lastUpdateMs: state.lastUpdateMs,
    lastFireSlot: currentSlot,
  })
}

/**
 * Reset detector counts when entering a new tumbling window.
 * Preserves lastFireSlot so once-per-window checks still work.
 */
function resetForNewWindow(
  state: DetectorState,
  nowMs: number,
): DetectorState {
  return Object.freeze({
    counts: Object.freeze(Array.from<number>({ length: state.counts.length }).fill(0)),
    head: 0,
    total: 0,
    lastUpdateMs: nowMs,
    lastFireSlot: state.lastFireSlot,
  })
}

function processSlidingEvent(
  state: DetectorState,
  input: ProcessDetectorInput,
): readonly [boolean, DetectorState] {
  const slotMs = input.slotMs ?? DEFAULT_SLOT_MS

  // First advance time
  const slotDelta = calculateSlotDelta(state.lastUpdateMs, input.nowMs, slotMs)
  let newState = advanceSlots(state, slotDelta, slotMs)

  // Update lastUpdateMs to current time
  newState = Object.freeze({
    ...newState,
    lastUpdateMs: input.nowMs,
  })

  // Increment count
  newState = incrementCount(newState)

  // Sliding mode fires on every matched event after threshold is reached.
  return [newState.total >= input.threshold, newState] as const
}

function processTumblingEvent(
  state: DetectorState,
  input: ProcessDetectorInput,
): readonly [boolean, DetectorState] {
  const currentWindowSlot = Math.floor(input.nowMs / input.windowMs)
  const previousWindowSlot = Math.floor(state.lastUpdateMs / input.windowMs)

  let newState = state
  if (currentWindowSlot !== previousWindowSlot) {
    newState = resetForNewWindow(state, input.nowMs)
  }
  else {
    newState = Object.freeze({
      ...newState,
      lastUpdateMs: input.nowMs,
    })
  }

  newState = incrementCount(newState)

  // Tumbling mode fires at most once in the same window.
  const shouldFire = newState.total >= input.threshold && newState.lastFireSlot !== currentWindowSlot
  if (!shouldFire) {
    return [false, newState] as const
  }

  return [true, Object.freeze({
    ...newState,
    lastFireSlot: currentWindowSlot,
  })] as const
}

/**
 * Process an event and check if threshold is reached (pure function)
 *
 * Returns [shouldFire, newState]
 */
export function processEvent(
  state: DetectorState,
  input: ProcessDetectorInput,
): readonly [boolean, DetectorState] {
  if (input.mode === 'tumbling') {
    return processTumblingEvent(state, input)
  }

  return processSlidingEvent(state, input)
}

/**
 * Parse window duration string to milliseconds
 * Supports: '2s', '500ms', '1m', '100'
 */
export function parseWindowDuration(duration: string): number {
  const match = duration.match(WINDOW_DURATION_RE)
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`)
  }

  const value = Number.parseFloat(match[1])
  const unit = match[2] || 'ms'

  switch (unit) {
    case 'ms': return value
    case 's': return value * 1000
    case 'm': return value * 60 * 1000
    default: return value
  }
}

/**
 * Calculate number of slots for a given window duration
 */
export function calculateWindowSlots(
  windowMs: number,
  slotMs: number = DEFAULT_SLOT_MS,
): number {
  return Math.max(1, Math.ceil(windowMs / slotMs))
}
