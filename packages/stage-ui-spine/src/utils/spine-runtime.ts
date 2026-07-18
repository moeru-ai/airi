import type { SpineVersion } from './spine-version'

/**
 * Lazily loads the spine-webgl runtime for the given Spine version.
 *
 * Use when:
 * - The skeleton version has been detected and we need the matching runtime
 *   to parse and render the model correctly.
 *
 * Expects:
 * - A valid SpineVersion ('4.0', '4.1', or '4.2').
 *
 * Returns:
 * - The full spine-webgl module namespace for that version.
 */
export async function loadSpineRuntime(version: SpineVersion): Promise<typeof import('@esotericsoftware/spine-webgl')> {
  switch (version) {
    case '4.0':
      return await import('@esotericsoftware/spine-webgl-4-0') as unknown as typeof import('@esotericsoftware/spine-webgl')
    case '4.1':
      return await import('@esotericsoftware/spine-webgl-4-1') as unknown as typeof import('@esotericsoftware/spine-webgl')
    case '4.2':
      return await import('@esotericsoftware/spine-webgl')
  }
}
