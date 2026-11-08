import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia'

/**
 * A window that hosts the fullscreen mode.
 *
 * - `main-window`: the main window, which grows over its display.
 * - `workspace-window`: the window of the `multi-window` mode, which shows the mode from the start.
 */
export type FullscreenHost = 'main-window' | 'workspace-window'

/** Describes the synchronization and Stage runtime policy for one renderer. */
export interface RendererWindowContext {
  /** Determines whether this renderer can own synchronized actions. */
  leadership: LeadershipMode
  /** Determines whether this renderer initializes Stage integrations. */
  stageRuntime: 'full' | 'minimal'
  /** The host of the fullscreen mode that this renderer is. A host routes the fullscreen surfaces under its page. */
  fullscreenHost?: FullscreenHost
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
 * // => { leadership: 'follower-only', stageRuntime: 'minimal', fullscreenHost: undefined }
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

  const fullscreenHost = query.get('fullscreen-host')
  if (fullscreenHost !== null && fullscreenHost !== 'main-window' && fullscreenHost !== 'workspace-window')
    throw new TypeError(`Invalid fullscreen-host query: ${fullscreenHost}`)

  return {
    leadership: syncedLeader === 'true' ? 'leader-only' : 'follower-only',
    stageRuntime: stageRuntime === 'minimal' ? 'minimal' : 'full',
    fullscreenHost: fullscreenHost ?? undefined,
  }
}
