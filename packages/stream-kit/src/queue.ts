export interface HandlerContext<T> {
  data: T
  emit: (eventName: string, ...params: unknown[]) => void
}

export interface Events<T> {
  enqueue: Array<(payload: T, queueLength: number) => void>
  dequeue: Array<(payload: T, queueLength: number) => void>
  process: Array<(payload: T, handler: (param: HandlerContext<T>) => Promise<unknown>) => void>
  error: Array<(payload: T, error: unknown, handler: (param: HandlerContext<T>) => Promise<unknown>) => void>
  result: Array<<R>(payload: T, result: R, handler: (param: HandlerContext<T>) => Promise<unknown>) => void>
  drain: Array<() => void>
}

export function createQueue<T>(options: {
  handlers: Array<(ctx: HandlerContext<T>) => Promise<void>>
}) {
  const queue: T[] = []
  // Set before the first handler runs. `drain` calls a handler synchronously, before it returns its promise, so a
  // handler that enqueues must see this flag. Otherwise that enqueue starts a nested drain and runs its item first.
  let draining = false

  // Listeners are stored per event name. The record keeps only `unknown` because the event name selects the
  // listener type, which the record type cannot express. `on` is the only writer, so it stores a matching listener.
  const internalEventListeners: Record<keyof Events<T>, unknown[]> = {
    enqueue: [],
    dequeue: [],
    process: [],
    error: [],
    result: [],
    drain: [],
  }
  const internalHandlerEventListeners: Record<string, Array<(...params: unknown[]) => void>> = {}

  function on<E extends keyof Events<T>>(eventName: E, listener: Events<T>[E][number]) {
    internalEventListeners[eventName].push(listener)
  }

  function emit<E extends keyof Events<T>>(eventName: E, ...params: Parameters<Events<T>[E][number]>) {
    const listeners = internalEventListeners[eventName] as Array<(...args: Parameters<Events<T>[E][number]>) => void>
    listeners.forEach(listener => listener(...params))
  }

  function onHandlerEvent(eventName: string, listener: (...params: unknown[]) => void) {
    internalHandlerEventListeners[eventName] = internalHandlerEventListeners[eventName] || []
    internalHandlerEventListeners[eventName].push(listener)
  }

  function emitHandlerEvent(eventName: string, ...params: unknown[]) {
    const listeners = internalHandlerEventListeners[eventName] || []
    listeners.forEach(listener => listener(...params))
  }

  function enqueue(payload: T) {
    queue.push(payload)
    emit('enqueue', payload, queue.length)
    if (!draining) {
      draining = true
      void drain()
    }
  }

  function clear() {
    queue.length = 0
  }

  async function drain() {
    while (queue.length > 0) {
      const payload = queue.shift() as T
      emit('dequeue', payload, queue.length)
      for (const handler of options.handlers) {
        emit('process', payload, handler)
        try {
          const result = await handler({ data: payload, emit: emitHandlerEvent })
          emit('result', payload, result, handler)
        }
        catch (err) {
          emit('error', payload, err, handler)
          continue
        }
      }
    }

    draining = false
    emit('drain')
  }

  function length() {
    return queue.length
  }

  return {
    enqueue,
    clear,
    length,
    on,
    onHandlerEvent,
  }
}

export type UseQueueReturn<T> = ReturnType<typeof createQueue<T>>
