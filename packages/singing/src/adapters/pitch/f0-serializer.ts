/**
 * Utilities for serializing/deserializing F0 pitch data.
 */

/**
 * Serialize F0 array to JSON format.
 */
export function serializeF0ToJson(f0: number[], hopSize: number): string {
  return JSON.stringify({ f0, hopSize })
}

/**
 * Deserialize F0 data from JSON.
 */
export function deserializeF0FromJson(json: string): { f0: number[], hopSize: number } {
  return JSON.parse(json) as { f0: number[], hopSize: number }
}
