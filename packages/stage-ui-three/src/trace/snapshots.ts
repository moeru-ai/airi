import type { VRM } from '@pixiv/three-vrm'
import type { AnimationMixer, Material, Object3D, WebGLRenderer } from 'three'

import type {
  ThreeRendererMemorySnapshot,
  VrmSceneSnapshotInput,
  VrmSceneSummarySnapshot,
} from './types'

import { Mesh, SkinnedMesh, Texture } from 'three'

function maybeGetJsHeapUsedBytes() {
  const performanceMemory = (globalThis.performance as {
    memory?: { usedJSHeapSize?: number }
  } | undefined)?.memory

  const heapUsed = performanceMemory?.usedJSHeapSize
  return typeof heapUsed === 'number' && Number.isFinite(heapUsed)
    ? heapUsed
    : undefined
}

export function createThreeRendererMemorySnapshot(renderer?: WebGLRenderer): ThreeRendererMemorySnapshot {
  if (!renderer) {
    return {
      calls: 0,
      geometries: 0,
      jsHeapUsedBytes: maybeGetJsHeapUsedBytes(),
      lines: 0,
      points: 0,
      textures: 0,
      triangles: 0,
    }
  }

  return {
    calls: renderer.info.render.calls,
    geometries: renderer.info.memory.geometries,
    jsHeapUsedBytes: maybeGetJsHeapUsedBytes(),
    lines: renderer.info.render.lines,
    points: renderer.info.render.points,
    programs: renderer.info.programs?.length,
    textures: renderer.info.memory.textures,
    triangles: renderer.info.render.triangles,
  }
}

function collectMaterialTextures(material: Material, textures: Set<Texture>) {
  for (const value of Object.values(material)) {
    if (value instanceof Texture)
      textures.add(value)
  }
}

export function createVrmSceneSummarySnapshot(input?: VrmSceneSnapshotInput | VRM, maybeMixer?: AnimationMixer): VrmSceneSummarySnapshot {
  const params: VrmSceneSnapshotInput = input && 'scene' in input
    ? { mixer: maybeMixer, vrm: input }
    : (input ?? {})

  const activeVrm = params.vrm
  if (!activeVrm) {
    return {
      animationActionCount: params.mixer ? ((params.mixer as AnimationMixer & { _actions?: unknown[] })._actions?.length ?? 0) : 0,
      materialCount: 0,
      meshCount: 0,
      sceneChildCount: 0,
      skinnedMeshCount: 0,
      textureRefCount: 0,
    }
  }

  let meshCount = 0
  let skinnedMeshCount = 0
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  activeVrm.scene.traverse((child: Object3D) => {
    if (child instanceof Mesh)
      meshCount += 1

    if (child instanceof SkinnedMesh)
      skinnedMeshCount += 1

    const maybeMaterial = (child as Mesh).material
    if (!maybeMaterial)
      return

    const materialList = Array.isArray(maybeMaterial) ? maybeMaterial : [maybeMaterial]
    for (const material of materialList) {
      if (!material || materials.has(material))
        continue
      materials.add(material)
      collectMaterialTextures(material, textures)
    }
  })

  return {
    animationActionCount: params.mixer ? ((params.mixer as AnimationMixer & { _actions?: unknown[] })._actions?.length ?? 0) : 0,
    materialCount: materials.size,
    meshCount,
    sceneChildCount: activeVrm.scene.children.length,
    skinnedMeshCount,
    textureRefCount: textures.size,
  }
}
