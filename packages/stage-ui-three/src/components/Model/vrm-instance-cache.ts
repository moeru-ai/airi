import type { VRM } from '@pixiv/three-vrm'
import type { AnimationMixer, Group } from 'three'

import type { AvatarAnimator } from '../../composables/vrm/avatar-animator'
import type { useVRMEmote } from '../../composables/vrm/expression'
import type { VrmInteractionColliderSet } from '../../composables/vrm/interaction'
import type { MoodFace } from '../../composables/vrm/mood-face'
import type { PerformanceDirector } from '../../composables/vrm/performance-director'

import { getStageThreeRuntimeTraceContext, isStageThreeRuntimeTraceEnabled } from '../../trace/context'
import { stageThreeTraceVrmCacheEvent } from '../../trace/eventa'

export interface ManagedVrmInstance {
  /** Owns `mixer`. Plays the idle pool, talking, thinking, and emotes. */
  animator: AvatarAnimator
  /** Procedural head and chest layer on top of the animator. */
  director: PerformanceDirector
  emote: ReturnType<typeof useVRMEmote>
  /** Mood face, reactions, blink, and emote face, ported from Utsuwa. */
  moodFace: MoodFace
  group: Group
  interactionColliders: VrmInteractionColliderSet
  mixer: AnimationMixer
  modelSrc: string
  scopeKey: string
  vrm: VRM
}

interface ManagedVrmCacheState {
  detachedByScope: Record<string, ManagedVrmInstance | undefined>
}

const hotData = import.meta.hot?.data as { managedVrmCacheState?: ManagedVrmCacheState } | undefined

const managedVrmCacheState = hotData?.managedVrmCacheState ?? { detachedByScope: {} }

if (import.meta.hot)
  import.meta.hot.data.managedVrmCacheState = managedVrmCacheState

function emitCacheTrace(action: 'clear' | 'stash' | 'take', scopeKey: string, result: 'empty' | 'evicted' | 'hit' | 'miss' | 'stored', modelSrc?: string) {
  if (!isStageThreeRuntimeTraceEnabled())
    return
  getStageThreeRuntimeTraceContext().emit(stageThreeTraceVrmCacheEvent, {
    action,
    modelSrc,
    result,
    scopeKey,
    ts: performance.now(),
  })
}

export function takeManagedVrmInstance(scopeKey: string, modelSrc: string) {
  const cached = managedVrmCacheState.detachedByScope[scopeKey]
  if (!cached || cached.modelSrc !== modelSrc) {
    emitCacheTrace('take', scopeKey, 'miss', modelSrc)
    return undefined
  }

  delete managedVrmCacheState.detachedByScope[scopeKey]
  emitCacheTrace('take', scopeKey, 'hit', modelSrc)
  return cached
}

export function stashManagedVrmInstance(instance: ManagedVrmInstance) {
  const { scopeKey } = instance
  const previous = managedVrmCacheState.detachedByScope[scopeKey]
  managedVrmCacheState.detachedByScope[scopeKey] = instance

  if (previous === instance) {
    return undefined
  }

  if (previous) {
    emitCacheTrace('stash', scopeKey, 'evicted', instance.modelSrc)
    return previous
  }

  emitCacheTrace('stash', scopeKey, 'stored', instance.modelSrc)
  return undefined
}

export function clearManagedVrmInstance(scopeKey: string) {
  const cached = managedVrmCacheState.detachedByScope[scopeKey]
  delete managedVrmCacheState.detachedByScope[scopeKey]

  if (cached) {
    emitCacheTrace('clear', scopeKey, 'hit', cached.modelSrc)
    return cached
  }

  emitCacheTrace('clear', scopeKey, 'empty')
  return undefined
}
