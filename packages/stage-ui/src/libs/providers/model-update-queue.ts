export interface TranscriptionModelUpdateQueue {
  enqueue: (action: () => Promise<void>) => Promise<void>
  runAfterLatest: <Result>(action: () => Promise<Result>) => Promise<Result>
  update: (model: string) => Promise<void>
}

/**
 * Serializes transcription model writes and keeps the latest write awaitable by playground requests.
 */
export function createTranscriptionModelUpdateQueue(
  updateModel: (model: string) => Promise<void>,
  onError: (cause: unknown) => void,
): TranscriptionModelUpdateQueue {
  let settledTask = Promise.resolve()
  let latestTask = settledTask

  function enqueue(action: () => Promise<void>) {
    const nextTask = settledTask.then(action)
    latestTask = nextTask
    settledTask = nextTask.catch(onError)
    return nextTask
  }

  function update(model: string) {
    return enqueue(() => updateModel(model))
  }

  async function runAfterLatest<Result>(action: () => Promise<Result>) {
    await latestTask
    return await action()
  }

  return { enqueue, runAfterLatest, update }
}
