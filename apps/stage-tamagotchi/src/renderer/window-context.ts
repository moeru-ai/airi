import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia'

/** Describes the synchronization and Stage runtime policy for one renderer. */
export interface RendererWindowContext {
  /** Determines whether this renderer can own synchronized actions. */
  leadership: LeadershipMode
  /** Determines whether this renderer initializes Stage integrations. */
  stageRuntime: 'full' | 'minimal'
}

/**
 * Resolves renderer ownership from the query that the main process supplies.
 *
 * @example
 * resolveRendererWindowContext('?synced-leader=false&stage-runtime=minimal')
 * // => { leadership: 'follower-only', stageRuntime: 'minimal' }
 */
export function resolveRendererWindowContext(search = globalThis.location?.search ?? ''): RendererWindowContext {
  const query = new URLSearchParams(search)
  const syncedLeader = query.get('synced-leader')
  if (syncedLeader === null)
    throw new TypeError('Missing synced-leader query')
  if (syncedLeader !== 'true' && syncedLeader !== 'false')
    throw new TypeError(`Invalid synced-leader query: ${syncedLeader}`)

  const stageRuntime = query.get('stage-runtime')
  if (stageRuntime !== null && stageRuntime !== 'minimal')
    throw new TypeError(`Invalid stage-runtime query: ${stageRuntime}`)

  return {
    leadership: syncedLeader === 'true' ? 'leader-only' : 'follower-only',
    stageRuntime: stageRuntime === 'minimal' ? 'minimal' : 'full',
  }
}
