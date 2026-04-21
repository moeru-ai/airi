import { createContext } from '@moeru/eventa/adapters/event-target'

/**
 * Creates a control-plane Eventa context backed by a local `EventTarget`.
 *
 * Use when:
 * - A browser-like runtime wants an in-process host channel transport
 *
 * Expects:
 * - `eventTarget` dispatches and listens for the Eventa adapter event format
 *
 * Returns:
 * - An Eventa context that can be assigned to the active host channel
 */
export function createEventTargetHostChannel(eventTarget: EventTarget) {
  // TODO: implement actual event target based host channel
  return createContext(eventTarget)
}

/**
 * Creates a data-plane Eventa context backed by a local `EventTarget`.
 *
 * Use when:
 * - A browser-like runtime wants an in-process shared data channel transport
 *
 * Expects:
 * - `eventTarget` dispatches and listens for the Eventa adapter event format
 *
 * Returns:
 * - An Eventa context that can be assigned to the active data channel
 */
export function createEventTargetDataChannel(eventTarget: EventTarget) {
  // TODO: implement actual event target based data channel
  return createContext(eventTarget)
}
