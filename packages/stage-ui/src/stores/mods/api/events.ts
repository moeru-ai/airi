import { nanoid } from 'nanoid'

export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
  id: string
  payload: TPayload
  priority?: EventPriority
  source?: string
  tags?: string[]
  time: number
  type: TType
}

export type EventPriority = 'critical' | 'high' | 'low' | 'normal'

export interface EventStream<T> {
  close: () => void
  emit: (event: T) => void
  stream: ReadableStream<T>
}

export function createEvent<TPayload>(type: string, payload: TPayload, options?: { id?: string, priority?: EventPriority, source?: string, tags?: string[], time?: number }): EventEnvelope<string, TPayload> {
  return {
    id: options?.id ?? nanoid(),
    payload,
    priority: options?.priority,
    source: options?.source,
    tags: options?.tags,
    time: options?.time ?? Date.now(),
    type,
  }
}

export function createEventStream<T>(): EventStream<T> {
  let controller: ReadableStreamDefaultController<T> | undefined
  const stream = new ReadableStream<T>({
    cancel() {
      controller = undefined
    },
    start(ctrl) {
      controller = ctrl
    },
  })

  return {
    close() {
      controller?.close()
      controller = undefined
    },
    emit(event) {
      controller?.enqueue(event)
    },
    stream,
  }
}
