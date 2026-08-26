export interface ControllableStream<R = any> {
  controller: ReadableStreamDefaultController<R>
  stream: ReadableStream<R>
}

export function createControllableStream<R = any>(): ControllableStream<R> {
  // WHY!: ReadableStream.start is called synchronously and immediately
  let controller!: ReadableStreamDefaultController<R>

  const stream = new ReadableStream<R>({
    start(ctrl) {
      controller = ctrl
    },
  })
  return { controller, stream }
}
