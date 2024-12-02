import { stat } from 'node:fs/promises'

export async function exists(path: string) {
  try {
    await stat(path)
    return true
  }
  catch (error) {
    if (isENOENTError(error))
      return false

    throw error
  }
}

export function isENOENTError(error: unknown): boolean {
  if (!(error instanceof Error))
    return false
  if (!('code' in error))
    return false
  if (error.code !== 'ENOENT')
    return false

  return true
}
