import { AudioFormat } from '../constants/file-formats'

/**
 * Check if a file extension is a supported audio format.
 */
export function isSupportedAudioFormat(extension: string): boolean {
  return Object.values(AudioFormat).includes(extension as AudioFormat)
}

/**
 * Validate that a URI string is non-empty and looks like a valid path or URL.
 */
export function isValidUri(uri: string): boolean {
  if (!uri || uri.trim().length === 0)
    return false
  return uri.startsWith('/') || uri.startsWith('http') || uri.startsWith('file://')
}
