/**
 * Runs imported regex keys outside the renderer. Rejects and terminates the
 * worker after one second, including startup, instead of silently dropping lore.
 */
export function matchRegexKeys(keys: string[], text: string, caseSensitive: boolean): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./regex-worker.ts', import.meta.url), { type: 'module' })
    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new Error('Lorebook regex matching timed out'))
    }, 1000)
    worker.onmessage = (event: MessageEvent<boolean>) => {
      clearTimeout(timeout)
      worker.terminate()
      resolve(event.data)
    }
    worker.onerror = () => {
      clearTimeout(timeout)
      worker.terminate()
      reject(new Error('Lorebook regex worker failed'))
    }
    worker.postMessage({ keys, text, caseSensitive })
  })
}
