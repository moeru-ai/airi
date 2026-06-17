export interface ControllableStream<R = unknown> {
  stream: ReadableStream<R>
  controller: ReadableStreamDefaultController<R>
}

export function createControllableStream<R = unknown>(): ControllableStream<R> {
  // WHY!: ReadableStream.start is called synchronously and immediately
  let controller!: ReadableStreamDefaultController<R>

  const stream = new ReadableStream<R>({
    start(ctrl) {
      controller = ctrl
    },
  })
  return { stream, controller }
}
