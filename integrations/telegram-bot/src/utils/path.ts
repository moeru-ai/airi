import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function relativeOf(path: string, base: string) {
  return join(dirname(fileURLToPath(base)), path)
}
