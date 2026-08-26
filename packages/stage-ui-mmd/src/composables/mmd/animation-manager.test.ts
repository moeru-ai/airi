import type { MMDUpdateOptions, PhysicsFactory } from '@moeru/three-mmd'
import type { AnimationMixer } from 'three'

import { MMD, PmxObject } from '@moeru/three-mmd'
import {
  AnimationClip,
  BufferGeometry,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'

import { createMMDAnimationManager } from './animation-manager'

function createPmx(): PmxObject {
  return {
    bones: [],
    displayFrames: [],
    header: {
      additionalVec4Count: 0,
      boneIndexSize: 4,
      comment: '',
      encoding: PmxObject.Header.Encoding.Utf8,
      englishComment: '',
      englishModelName: '',
      materialIndexSize: 4,
      modelName: '',
      morphIndexSize: 4,
      rigidBodyIndexSize: 4,
      signature: 'PMX',
      textureIndexSize: 4,
      version: 2,
      vertexIndexSize: 4,
    },
    indices: new Uint8Array(),
    joints: [],
    materials: [],
    morphs: [],
    rigidBodies: [],
    softBodies: [],
    textures: [],
    vertices: [],
  }
}

class RecordingMMD extends MMD {
  disposed = false
  gravity = new Vector3()
  mixer?: AnimationMixer
  updates: MMDUpdateOptions[] = []

  constructor() {
    const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial())
    mesh.bind(new Skeleton())
    super(createPmx(), mesh)
  }

  override setPhysics(_createPhysics: PhysicsFactory): void {
    this.physics = {
      createHelper: () => {
        throw new Error('No physics helper is used by this test runtime')
      },
      setGravity: gravity => this.gravity.copy(gravity),
      update: () => {},
    }
  }

  override updateWithMixer(delta: number, mixer: AnimationMixer, options: MMDUpdateOptions = {}): void {
    this.mixer = mixer
    this.updates.push({ ...options })
    mixer.update(delta)
  }

  override dispose(): void {
    this.disposed = true
    super.dispose()
  }
}

describe('createMMDAnimationManager', () => {
  it('forwards runtime feature gates, gravity, and disposal to MMD', async () => {
    const mmd = new RecordingMMD()
    const manager = createMMDAnimationManager(mmd, { physicsEnabled: false })

    manager.setGravity(3.5)
    manager.setIKEnabled(false)
    await manager.init()
    manager.update(1 / 60)

    expect(mmd.gravity.toArray()).toEqual([0, -3.5, 0])
    expect(mmd.updates).toEqual([
      { grant: true, ik: false, physics: false },
    ])

    manager.setPhysicsEnabled(true)
    manager.setGrantEnabled(false)
    manager.update(1 / 30)

    expect(mmd.updates[1]).toEqual({ grant: false, ik: false, physics: true })

    manager.dispose()
    manager.update(1)

    expect(mmd.disposed).toBe(true)
    expect(mmd.updates).toHaveLength(2)
  })

  it('returns a completed one-shot action to the configured idle motion', async () => {
    const mmd = new RecordingMMD()
    const manager = createMMDAnimationManager(mmd)
    const idle = new AnimationClip('idle', 1, [])
    const gesture = new AnimationClip('gesture', 0.1, [])

    manager.registerClip('idle', idle)
    manager.registerClip('gesture', gesture)
    await manager.init()
    manager.setIdleMotion('idle', 0)
    manager.playAction('gesture', { crossfade: 0 })
    manager.update(0.2)

    const idleAction = mmd.mixer?.existingAction(idle)
    const gestureAction = mmd.mixer?.existingAction(gesture)
    expect(idleAction?.isRunning()).toBe(true)
    expect(gestureAction?.isRunning()).toBe(false)
  })
})
