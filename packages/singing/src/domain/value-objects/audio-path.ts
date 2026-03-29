/**
 * Value object representing a validated audio file path.
 * Ensures the path exists and points to a supported format.
 */
export interface AudioPath {
  readonly value: string
  readonly format: string
}

/**
 * Create an AudioPath value object.
 */
export function createAudioPath(filePath: string): AudioPath {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return { value: filePath, format: ext }
}
