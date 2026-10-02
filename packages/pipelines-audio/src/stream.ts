export interface StreamController<T> {
  stream: ReadableStream<T>
  write: (value: T) => void
  close: () => void
  error: (err: unknown) => void
  isClosed: () => boolean
}

/** The optional cancellation handler owns resources that feed this readable output. */
export function createPushStream<T>(onCancel?: (reason: unknown) => void): StreamController<T> {
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
  })

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
