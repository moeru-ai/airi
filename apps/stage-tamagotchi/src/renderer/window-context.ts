import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia'

import type { RendererWindowType } from '../shared/renderer-window'

import { isRendererWindowType, rendererWindowQueryKey } from '../shared/renderer-window'

/** Describes the synchronization and Stage runtime policy for one renderer. */
export interface RendererWindowContext {
  /** Determines whether this renderer can own synchronized actions. */
  leadership: LeadershipMode
  /** Determines whether this renderer initializes Stage integrations. */
  stageRuntime: 'full' | 'minimal'
  /** Identifies the Electron window that owns this renderer. */
  type: RendererWindowType
}

const minimalStageRuntimeWindows: ReadonlySet<RendererWindowType> = new Set([
  'chat',
  'editor',
  'spotlight',
])

/**
 * Resolves renderer ownership from the query that the main process supplies.
 *
 * @example
 * resolveRendererWindowContext('?window=chat')
 * // => { leadership: 'follower-only', stageRuntime: 'minimal', type: 'chat' }
 */
export function resolveRendererWindowContext(search = globalThis.location?.search ?? ''): RendererWindowContext {
  const windowType = new URLSearchParams(search).get(rendererWindowQueryKey)
  if (windowType === null)
    throw new TypeError('Missing renderer window type')
  if (!isRendererWindowType(windowType))
    throw new TypeError(`Unknown renderer window type: ${windowType}`)

  return {
    leadership: windowType === 'main' ? 'leader-only' : 'follower-only',
    stageRuntime: minimalStageRuntimeWindows.has(windowType) ? 'minimal' : 'full',
    type: windowType,
  }
}
