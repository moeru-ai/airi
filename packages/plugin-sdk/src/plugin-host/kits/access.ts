import type { NormalizedKitUse } from '../../kit/references'

/** One request to use a Kit that the Manifest does not list in `kits.uses`. */
export interface KitGrantRequest {
  readonly extensionId: string
  readonly sessionId: string
  readonly kitId: string
}

/**
 * Decides a dynamic Kit grant, for example by asking the user. The Host asks once for each plugin and Kit, then stores the answer.
 * The default policy denies.
 */
export type KitGrantPolicy = (request: KitGrantRequest) => boolean | Promise<boolean>

/** Stores the dynamic Kit grants of each plugin. */
export interface KitGrantStore {
  get: (extensionId: string, kitId: string) => boolean | undefined
  set: (extensionId: string, kitId: string, granted: boolean) => void
}

/** Stores the Kit dependencies that a plugin found at run time, so that the next start includes them. */
export interface KitDependencyStore {
  get: (extensionId: string) => readonly NormalizedKitUse[]
  set: (extensionId: string, uses: readonly NormalizedKitUse[]) => void
}

/** Grants each dynamic Kit request. Use it in tests and in trusted development builds. */
export const allowAllKitGrants: KitGrantPolicy = () => true

/** Denies each dynamic Kit request. */
export const denyAllKitGrants: KitGrantPolicy = () => false

/** Creates a grant store that keeps the answers in memory. */
export function createMemoryKitGrantStore(): KitGrantStore {
  const grants = new Map<string, boolean>()
  return {
    get: (extensionId, kitId) => grants.get(`${extensionId}\n${kitId}`),
    set: (extensionId, kitId, granted) => {
      grants.set(`${extensionId}\n${kitId}`, granted)
    },
  }
}

/** Creates a dependency store that keeps the found dependencies in memory. */
export function createMemoryKitDependencyStore(): KitDependencyStore {
  const uses = new Map<string, readonly NormalizedKitUse[]>()
  return {
    get: extensionId => uses.get(extensionId) ?? [],
    set: (extensionId, next) => {
      uses.set(extensionId, Object.freeze([...next]))
    },
  }
}

/**
 * Tests a Kit id against an allow pattern. `*` matches any characters.
 *
 * @example
 * matchKitPattern('airi.*', 'airi.fs-store') // => true
 */
export function matchKitPattern(pattern: string, kitId: string): boolean {
  const source = pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${source}$`).test(kitId)
}
