import { createContext } from '@moeru/eventa/adapters/event-target'
import { nanoid } from 'nanoid'

const EVENTA_MESSAGE_EVENT = 'eventa:message'
const EVENTA_RUNTIME_CHANNEL = 'airi:web-extension:eventa'

const runtimeInstanceId = nanoid()

interface EventaRuntimeMessage {
  __eventa: true
  channel: string
  sourceId: string
  type?: string
  detail?: unknown
}

type RuntimeEventListener = (event: Event) => void

class RuntimeEventTarget implements EventTarget {
  private listeners = new Map<string, Map<EventListenerOrEventListenerObject, RuntimeEventListener>>()

  constructor(private readonly send: (message: EventaRuntimeMessage) => void) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener)
      return

    if (!this.listeners.has(type))
      this.listeners.set(type, new Map())

    const handler: RuntimeEventListener = typeof listener === 'function'
      ? listener
      : event => listener.handleEvent(event)

    this.listeners.get(type)?.set(listener, handler)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener)
      return

    this.listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event) {
    const detail = 'detail' in event ? (event as CustomEvent).detail : undefined
    this.send({
      __eventa: true,
      channel: EVENTA_RUNTIME_CHANNEL,
      sourceId: runtimeInstanceId,
      type: event.type,
      detail,
    })

    return true
  }

  emit(type: string, detail?: unknown) {
    const event = { type, detail } as CustomEvent
    for (const listener of this.listeners.get(type)?.values() ?? [])
      listener(event)
  }
}

export function createRuntimeEventaContext() {
  const eventTarget = new RuntimeEventTarget((message) => {
    void browser.runtime.sendMessage(message).catch(() => {})
  })

  const { context, dispose } = createContext(eventTarget, {
    messageEventName: EVENTA_MESSAGE_EVENT,
    errorEventName: false,
  })

  const runtimeListener = (message: unknown) => {
    if (!message || typeof message !== 'object')
      return

    const runtimeMessage = message as EventaRuntimeMessage

    if (!('__eventa' in runtimeMessage) || !runtimeMessage.__eventa)
      return

    if (runtimeMessage.channel !== EVENTA_RUNTIME_CHANNEL)
      return

    if (runtimeMessage.sourceId === runtimeInstanceId)
      return

    eventTarget.emit(runtimeMessage.type ?? EVENTA_MESSAGE_EVENT, runtimeMessage.detail)
  }

  browser.runtime.onMessage.addListener(runtimeListener)

  return {
    context,
    dispose: () => {
      browser.runtime.onMessage.removeListener(runtimeListener)
      dispose()
    },
  }
}
