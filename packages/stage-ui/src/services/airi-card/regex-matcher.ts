/** Reuses one lazy Worker per compilation, with a one-second limit per match. */
export function createRegexMatcher() {
  let worker: Worker | undefined
  let previousText: string | undefined
  let pending: { reject: (error: Error) => void, timeout: ReturnType<typeof setTimeout> } | undefined

  function dispose() {
    worker?.terminate()
    worker = undefined
    previousText = undefined
    if (pending) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Lorebook regex matcher disposed'))
      pending = undefined
    }
  }

  function match(keys: string[], text: string, caseSensitive: boolean): Promise<boolean> {
    if (pending)
      return Promise.reject(new Error('Lorebook regex matching already in progress'))

    return new Promise((resolve, reject) => {
      worker ??= new Worker(new URL('./regex-worker.ts', import.meta.url), { type: 'module' })
      const fail = (error: Error) => {
        clearTimeout(pending?.timeout)
        pending = undefined
        dispose()
        reject(error)
      }
      pending = {
        reject,
        timeout: setTimeout(() => fail(new Error('Lorebook regex matching timed out')), 1000),
      }
      worker.onmessage = (event: MessageEvent<boolean>) => {
        clearTimeout(pending?.timeout)
        pending = undefined
        resolve(event.data)
      }
      worker.onerror = () => fail(new Error('Lorebook regex worker failed'))
      try {
        worker.postMessage({ keys, caseSensitive, ...(text === previousText ? {} : { text }) })
        previousText = text
      }
      catch (error) {
        fail(error instanceof Error ? error : new Error('Lorebook regex worker failed'))
      }
    })
  }

  return { match, dispose }
}
