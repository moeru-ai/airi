/**
 * Accumulator - Pure functions for sliding window counting
 *
 * All functions are pure: (state, input) => newState
 * No side effects, no mutation
 */

import type { AccumulatorState } from './types'

/**
 * Default slot duration in milliseconds
 */
export const DEFAULT_SLOT_MS = 20

/**
 * Create a new accumulator state with empty counts
 * @param windowSlots Number of slots in the sliding window
 * @param nowMs Current timestamp (for pure function compliance)
 */
export function createAccumulatorState(windowSlots: number, nowMs: number = Date.now()): AccumulatorState {
  return Object.freeze({
    counts: Object.freeze(new Array<number>(windowSlots).fill(0)),
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
  return Math.floor((nowMs - lastUpdateMs) / slotMs)
}

/**
 * Advance the accumulator by N slots (pure function)
 * Zeros out expired slots and adjusts total
 * @param state Current accumulator state
 * @param slotsToAdvance Number of slots to advance
 * @param slotMs Duration of each slot in milliseconds
 */
export function advanceSlots(
  state: AccumulatorState,
  slotsToAdvance: number,
  slotMs: number = DEFAULT_SLOT_MS,
): AccumulatorState {
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
  state: AccumulatorState,
  incrementBy: number = 1,
): AccumulatorState {
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
 * Reset accumulator after firing (pure function)
 */
export function resetAfterFire(
  state: AccumulatorState,
  currentSlot: number,
): AccumulatorState {
  const windowSize = state.counts.length

  return Object.freeze({
    counts: Object.freeze(new Array<number>(windowSize).fill(0)),
    head: state.head,
    total: 0,
    lastUpdateMs: state.lastUpdateMs,
    lastFireSlot: currentSlot,
  })
}

/**
 * Process an event and check if threshold is reached (pure function)
 *
 * Returns [shouldFire, newState]
 */
export function processEvent(
  state: AccumulatorState,
  threshold: number,
  nowMs: number,
  slotMs: number = DEFAULT_SLOT_MS,
): readonly [boolean, AccumulatorState] {
  // First advance time
  const slotDelta = calculateSlotDelta(state.lastUpdateMs, nowMs, slotMs)
  let newState = advanceSlots(state, slotDelta, slotMs)

  // Update lastUpdateMs to current time
  newState = Object.freeze({
    ...newState,
    lastUpdateMs: nowMs,
  })

  // Increment count
  newState = incrementCount(newState)

  // Check threshold
  if (newState.total >= threshold) {
    const firedState = resetAfterFire(newState, newState.head)
    return [true, firedState] as const
  }

  return [false, newState] as const
}

/**
 * Parse window duration string to milliseconds
 * Supports: '2s', '500ms', '1m', '100'
 */
export function parseWindowDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/)
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
