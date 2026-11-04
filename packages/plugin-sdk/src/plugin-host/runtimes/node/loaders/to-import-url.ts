import { platform } from 'node:process'
import { pathToFileURL } from 'node:url'

export function toImportUrl(path: string, windows = platform === 'win32') {
  return pathToFileURL(path, { windows }).href
}
