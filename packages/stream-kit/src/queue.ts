export interface HandlerContext<T> {
  data: T
  // JS-0339: replace `any[]` with `unknown[]`
  emit: (eventName: string, ...params: unknown[]) => void
}

export interface Events<T> {
  enqueue: Array<(payload: T, queueLength: number) => void>
  dequeue: Array<(payload: T, queueLength: number) => void>
  // JS-0339: replace `any` with `unknown` for handler return types
  process: Array<(payload: T, handler: (param: HandlerContext<T>) => Promise<unknown>) => void>
  error: Array<(payload: T, error: unknown, handler: (param: HandlerContext<T>) => Promise<unknown>) => void>
  result: Array<<R>(payload: T, result: R, handler: (param: HandlerContext<T>) => Promise<unknown>) => void>
  drain: Array<() => void>
}

export function createQueue<T>(options: { handlers: Array<(ctx: HandlerContext<T>) => Promise<void>> }) {
  const queue: T[] = []
  // JS-0339: replace `any` with `unknown`
  let drainTask: Promise<unknown> | undefined

  const internalEventListeners: Events<T> = {
    enqueue: [],
    dequeue: [],
    process: [],
    error: [],
    result: [],
    drain: [],
  }
  // JS-0339: replace `any[]` with `unknown[]`
  const internalHandlerEventListeners: Record<string, Array<(...params: unknown[]) => void>> = {}

  function on<E extends keyof Events<T>>(eventName: E, listener: Events<T>[E][number]) {
    // JS-0339: cast via unknown to preserve type safety
    internalEventListeners[eventName].push(listener as unknown as Events<T>[E][number])
  }

  function emit<E extends keyof Events<T>>(eventName: E, ...params: Parameters<Events<T>[E][number]>) {
    const listeners = internalEventListeners[eventName] as Events<T>[E]
    listeners.forEach((listener) => (listener as unknown as (...p: unknown[]) => void)(...params))
  }

  function onHandlerEvent(eventName: string, listener: (...params: unknown[]) => void) {
    internalHandlerEventListeners[eventName] = internalHandlerEventListeners[eventName] || []
    internalHandlerEventListeners[eventName].push(listener)
  }

  function emitHandlerEvent(eventName: string, ...params: unknown[]) {
    const listeners = internalHandlerEventListeners[eventName] || []
    listeners.forEach((listener) => listener(...params))
  }

  function enqueue(payload: T) {
    queue.push(payload)
    emit('enqueue', payload, queue.length)
    if (!drainTask) {
      drainTask = drain()
    }
  }

  function clear() {
    queue.length = 0
  }

  async function drain(): Promise<void> {
    while (queue.length > 0) {
      const payload = queue.shift() as T
      emit('dequeue', payload, queue.length)
      for (const handler of options.handlers) {
        emit('process', payload, handler)
        try {
          const result = await handler({ data: payload, emit: emitHandlerEvent })
          emit('result', payload, result, handler)
        } catch (err) {
          emit('error', payload, err, handler)
        }
      }
    }

    emit('drain')
    drainTask = undefined
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
