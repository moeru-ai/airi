export interface TranscriptionModelUpdateQueue {
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

  function update(model: string) {
    const nextTask = settledTask.then(() => updateModel(model))
    latestTask = nextTask
    settledTask = nextTask.catch(onError)
    return nextTask
  }

  async function runAfterLatest<Result>(action: () => Promise<Result>) {
    await latestTask
    return await action()
  }

  return { runAfterLatest, update }
}
