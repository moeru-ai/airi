export interface StreamController<T> {
  stream: ReadableStream<T>
  write: (value: T) => void
  close: () => void
  error: (err: unknown) => void
  isClosed: () => boolean
  /** Remaining queue capacity under `strategy`. Negative when the reader is behind. Null after an error. */
  desiredSize: () => number | null
}

/**
 * The optional cancellation handler owns resources that feed this readable output.
 * `strategy` measures unread values. Writers check `desiredSize` because a push source cannot wait.
 */
export function createPushStream<T>(onCancel?: (reason: unknown) => void, strategy?: QueuingStrategy<T>): StreamController<T> {
  let closed = false
  let controller: ReadableStreamDefaultController<T> | null = null

  const stream = new ReadableStream<T>({
    start(ctrl) {
      controller = ctrl
    },
    cancel(reason) {
      closed = true
      onCancel?.(reason)
    },
  }, strategy)

  return {
    stream,
    write(value) {
      if (!controller || closed)
        return
      controller.enqueue(value)
    },
    close() {
      if (!controller || closed)
        return
      closed = true
      controller.close()
    },
    error(err) {
      if (!controller || closed)
        return
      closed = true
      controller.error(err)
    },
    isClosed() {
      return closed
    },
    desiredSize() {
      return controller?.desiredSize ?? null
    },
  }
}

export async function readStream<T>(stream: ReadableStream<T>, handler: (value: T) => Promise<void> | void) {
  const reader = stream.getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break

      await handler(value as T)
    }
  }
  finally {
    reader.releaseLock()
  }
}
