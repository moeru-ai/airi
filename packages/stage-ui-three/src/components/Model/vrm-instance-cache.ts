import type { VRM } from '@pixiv/three-vrm'
import type { AnimationMixer, Group } from 'three'

import type { useVRMEmote } from '../../composables/vrm/expression'

export interface ManagedVrmInstance {
  emote: ReturnType<typeof useVRMEmote>
  group: Group
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

export function takeManagedVrmInstance(scopeKey: string, modelSrc: string) {
  const cached = managedVrmCacheState.detachedByScope[scopeKey]
  if (!cached || cached.modelSrc !== modelSrc)
    return undefined

  delete managedVrmCacheState.detachedByScope[scopeKey]
  return cached
}

export function stashManagedVrmInstance(instance: ManagedVrmInstance) {
  const { scopeKey } = instance
  const previous = managedVrmCacheState.detachedByScope[scopeKey]
  managedVrmCacheState.detachedByScope[scopeKey] = instance

  return previous === instance ? undefined : previous
}

export function clearManagedVrmInstance(scopeKey: string) {
  const cached = managedVrmCacheState.detachedByScope[scopeKey]
  delete managedVrmCacheState.detachedByScope[scopeKey]
  return cached ?? undefined
}
