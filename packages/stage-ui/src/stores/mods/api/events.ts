import { nanoid } from 'nanoid'

export type EventPriority = 'critical' | 'high' | 'normal' | 'low'

export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
  id: string
  type: TType
  time: number
  priority?: EventPriority
  source?: string
  tags?: string[]
  payload: TPayload
}

export interface EventStream<T> {
  stream: ReadableStream<T>
  emit: (event: T) => void
  close: () => void
}

export function createEvent<TPayload>(type: string, payload: TPayload, options?: { priority?: EventPriority, source?: string, tags?: string[], id?: string, time?: number }): EventEnvelope<string, TPayload> {
  return {
    id: options?.id ?? nanoid(),
    type,
    time: options?.time ?? Date.now(),
    priority: options?.priority,
    source: options?.source,
    tags: options?.tags,
    payload,
  }
}

export function createEventStream<T>(): EventStream<T> {
  let controller: ReadableStreamDefaultController<T> | undefined
  const stream = new ReadableStream<T>({
    start(ctrl) {
      controller = ctrl
    },
    cancel() {
      controller = undefined
    },
  })

  return {
    stream,
    emit(event) {
      controller?.enqueue(event)
    },
    close() {
      controller?.close()
      controller = undefined
    },
  }
}
