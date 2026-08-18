import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia'

/** Describes the synchronization and Stage runtime policy for one renderer. */
export interface RendererWindowContext {
  /** Determines whether this renderer represents one user-visible app open. */
  appEntry: 'primary' | 'auxiliary'
  /** Determines whether this renderer can own synchronized actions. */
  leadership: LeadershipMode
  /** Determines whether this renderer initializes Stage integrations. */
  stageRuntime: 'full' | 'minimal'
}

function normalizeRoutePath(routePath: string) {
  const [path = ''] = routePath.split(/[?#]/)
  return path || '/'
}

/**
 * Resolves the initial renderer route before Vue Router hydrates the hash.
 *
 * @example
 * resolveInitialRendererRoutePath('/', '#/widgets?source=tray')
 * // => '/widgets'
 */
export function resolveInitialRendererRoutePath(routePath: string, hash = globalThis.location?.hash ?? ''): string {
  const hashPath = hash.startsWith('#') ? hash.slice(1) : ''
  return normalizeRoutePath(hashPath || routePath)
}

/**
 * Resolves renderer ownership from the query that the main process supplies.
 *
 * @example
 * resolveRendererWindowContext('?synced-leader=false&stage-runtime=minimal')
 * // => { appEntry: 'auxiliary', leadership: 'follower-only', stageRuntime: 'minimal' }
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
    appEntry: syncedLeader === 'true' ? 'primary' : 'auxiliary',
    leadership: syncedLeader === 'true' ? 'leader-only' : 'follower-only',
    stageRuntime: stageRuntime === 'minimal' ? 'minimal' : 'full',
  }
}
