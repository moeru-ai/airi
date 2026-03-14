import type { VRM } from '@pixiv/three-vrm'
import type { WebGLRenderer } from 'three'

import {
  Bone,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  Texture,
} from 'three'
import { describe, expect, it } from 'vitest'

import { createThreeRendererMemorySnapshot, createVrmSceneSummarySnapshot } from './snapshots'

describe('stage three runtime snapshots', () => {
  it('reads renderer info without requiring performance.memory', () => {
    const renderer = {
      info: {
        memory: {
          geometries: 4,
          textures: 3,
        },
        programs: [{}, {}],
        render: {
          calls: 9,
          lines: 2,
          points: 1,
          triangles: 42,
        },
      },
    } as WebGLRenderer

    const snapshot = createThreeRendererMemorySnapshot(renderer)

    expect(snapshot.calls).toBe(9)
    expect(snapshot.triangles).toBe(42)
    expect(snapshot.points).toBe(1)
    expect(snapshot.lines).toBe(2)
    expect(snapshot.textures).toBe(3)
    expect(snapshot.geometries).toBe(4)
    expect(snapshot.programs).toBe(2)
  })

  it('returns zeroed scene summary when vrm is unavailable', () => {
    expect(createVrmSceneSummarySnapshot()).toEqual({
      animationActionCount: 0,
      materialCount: 0,
      meshCount: 0,
      sceneChildCount: 0,
      skinnedMeshCount: 0,
      textureRefCount: 0,
    })
  })

  it('summarizes mesh, material, texture, and action counts from a vrm scene', () => {
    const scene = new Scene()
    const sharedTexture = new Texture()
    const material = new MeshStandardMaterial({ map: sharedTexture })
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)

    const skinnedMaterial = new MeshStandardMaterial({ map: sharedTexture })
    const skinnedMesh = new SkinnedMesh(new BoxGeometry(1, 1, 1), skinnedMaterial)
    const rootBone = new Bone()
    const childBone = new Bone()
    rootBone.add(childBone)
    skinnedMesh.add(rootBone)
    skinnedMesh.bind(new Skeleton([rootBone, childBone]))

    scene.add(mesh)
    scene.add(skinnedMesh)

    const summary = createVrmSceneSummarySnapshot({
      mixer: { _actions: [1, 2, 3] } as any,
      vrm: { scene } as unknown as VRM,
    })

    expect(summary.sceneChildCount).toBe(2)
    expect(summary.meshCount).toBe(2)
    expect(summary.skinnedMeshCount).toBe(1)
    expect(summary.materialCount).toBe(2)
    expect(summary.textureRefCount).toBe(1)
    expect(summary.animationActionCount).toBe(3)
  })
})
