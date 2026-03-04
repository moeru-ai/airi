import { createContext } from '@moeru/eventa/adapters/event-target'

export function createEventTargetHostChannel(eventTarget: EventTarget) {
  // TODO: implement actual event target based host channel
  return createContext(eventTarget)
}

export function createEventTargetDataChannel(eventTarget: EventTarget) {
  // TODO: implement actual event target based data channel
  return createContext(eventTarget)
}
