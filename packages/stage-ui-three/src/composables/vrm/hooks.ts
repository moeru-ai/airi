import type { VRM } from '@pixiv/three-vrm'
import type { Group, Material, Mesh, PerspectiveCamera } from 'three'

import type { VrmLifecycleReason } from '../../trace'

export interface VrmDisposeHookContext {
  camera: PerspectiveCamera
  reason: VrmLifecycleReason
  vrm: VRM
  vrmGroup: Group
}

export interface VrmFrameHookContext {
  camera: PerspectiveCamera
  delta: number
  vrm: VRM
  vrmGroup: Group
}

export interface VrmHook {
  onDispose?: (context: VrmDisposeHookContext) => void
  onFrame?: (context: VrmFrameHookContext) => void
  onLoad?: (context: VrmLoadHookContext) => void
  onMaterial?: (context: VrmMaterialHookContext) => void
}

export interface VrmLoadHookContext {
  cacheHit: boolean
  camera: PerspectiveCamera
  reason: VrmLifecycleReason
  vrm: VRM
  vrmGroup: Group
}

export interface VrmMaterialHookContext {
  camera: PerspectiveCamera
  material: Material
  materialIndex: number
  mesh: Mesh
  reason: VrmLifecycleReason
  vrm: VRM
  vrmGroup: Group
}
