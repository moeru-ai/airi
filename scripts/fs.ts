import { stat } from 'node:fs/promises'

export async function exists(path: string) {
  try {
    await stat(path)
    return true
  }
  catch (error) {
    if (!(error instanceof Error))
      throw error
    if (!('code' in error))
      throw error
    if (error.code !== 'ENOENT')
      throw error

    return false
  }
}
