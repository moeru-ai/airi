import { createContext } from '@moeru/eventa/adapters/event-target'
import { isPlainObject } from 'es-toolkit'

const EVENTA_MESSAGE_EVENT = 'eventa:message'

interface WindowMessageEventaEnvelope {
  __eventa: true
  channel: string
  sourceId: string
  detail?: unknown
}

type RuntimeEventListener = (event: Event) => void

class WindowMessageEventTarget implements EventTarget {
  private readonly listeners = new Map<string, Map<EventListenerOrEventListenerObject, RuntimeEventListener>>()

  constructor(private readonly send: (message: WindowMessageEventaEnvelope) => void) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) {
      return
    }

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Map())
    }

    const handler: RuntimeEventListener = typeof listener === 'function'
      ? listener
      : event => listener.handleEvent(event)

    this.listeners.get(type)?.set(listener, handler)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) {
      return
    }

    this.listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event) {
    const detail = 'detail' in event ? (event as CustomEvent).detail : undefined
    this.send({
      __eventa: true,
      channel: '',
      sourceId: '',
      detail,
    })

    return true
  }

  emit(type: string, detail?: unknown) {
    const event = { type, detail } as CustomEvent
    for (const listener of this.listeners.get(type)?.values() ?? []) {
      listener(event)
    }
  }
}

function isWindowMessageEventaEnvelope(value: unknown, channel: string): value is WindowMessageEventaEnvelope {
  if (!isPlainObject(value)) {
    return false
  }

  return value.__eventa === true
    && value.channel === channel
    && typeof value.sourceId === 'string'
}

/**
 * Creates an Eventa context backed by `window.postMessage`.
 *
 * Use when:
 * - A host window needs typed messaging with an iframe
 * - An iframe wants Eventa ergonomics without a bespoke adapter package
 *
 * Expects:
 * - `currentWindow` is the window receiving `message` events
 * - `targetWindow` resolves to the peer window when outbound events are emitted
 * - `channel` uniquely scopes one logical bridge on the page
 *
 * Returns:
 * - An Eventa context plus a disposer that removes window listeners
 */
export function createWindowMessageEventaContext(options: {
  channel: string
  currentWindow: Window
  targetWindow: () => Window | null | undefined
  expectedSource?: () => MessageEventSource | null | undefined
  targetOrigin?: string
}) {
  const sourceId = Math.random().toString(36).slice(2, 10)
  const eventTarget = new WindowMessageEventTarget((message) => {
    const targetWindow = options.targetWindow()
    if (!targetWindow) {
      return
    }

    targetWindow.postMessage({
      ...message,
      channel: options.channel,
      sourceId,
    }, options.targetOrigin ?? '*')
  })

  const { context, dispose } = createContext(eventTarget, {
    messageEventName: EVENTA_MESSAGE_EVENT,
    errorEventName: false,
  })

  const onWindowMessage = (event: MessageEvent) => {
    if (!isWindowMessageEventaEnvelope(event.data, options.channel)) {
      return
    }

    const expectedSource = options.expectedSource?.()
    if (expectedSource && event.source !== expectedSource) {
      return
    }

    if (event.data.sourceId === sourceId) {
      return
    }

    eventTarget.emit(EVENTA_MESSAGE_EVENT, event.data.detail)
  }

  options.currentWindow.addEventListener('message', onWindowMessage)

  return {
    context,
    dispose: () => {
      options.currentWindow.removeEventListener('message', onWindowMessage)
      dispose()
    },
  }
}
