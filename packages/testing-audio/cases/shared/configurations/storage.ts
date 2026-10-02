import type { AudioInputSession } from '../../../src/types'

/** Writes AIRI settings through the storage owned by the current runtime page. */
export async function configureStorage(
  runtime: AudioInputSession,
  settings: Record<string, string>,
): Promise<void> {
  await runtime.runtimePage.evaluate(({ entries }) => {
    for (const [key, value] of Object.entries(entries))
      localStorage.setItem(key, value)
  }, { entries: settings })
}
