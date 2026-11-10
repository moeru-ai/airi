import { describe, expect, it, vi } from 'vitest'

import * as spine42 from '@esotericsoftware/spine-webgl'
import * as spine40 from '@esotericsoftware/spine-webgl-4-0'
import * as spine41 from '@esotericsoftware/spine-webgl-4-1'

import { loadSpineRuntime, updateSpineWorldTransform } from './spine-runtime'

describe('spine runtime world transforms', () => {
  it.each([
    ['4.0', spine40],
    ['4.1', spine41],
    ['4.2', spine42],
  ] as const)('updates parent and child bones with Spine %s', async (version, expectedRuntime) => {
    const runtime = await loadSpineRuntime(version)
    expect(runtime).toBe(expectedRuntime)

    const data = new runtime.SkeletonData()
    const root = new runtime.BoneData(0, 'root', null)
    root.x = 10
    root.y = 20
    root.rotation = 90
    const child = new runtime.BoneData(1, 'child', root)
    child.x = 2
    data.bones.push(root, child)

    const skeleton = new runtime.Skeleton(data)
    skeleton.x = 5
    skeleton.y = -3
    const update = vi.spyOn(skeleton, 'updateWorldTransform')

    updateSpineWorldTransform(runtime, skeleton)

    if (version === '4.2')
      expect(update).toHaveBeenCalledExactlyOnceWith(spine42.Physics.update)
    else
      expect(update).toHaveBeenCalledExactlyOnceWith()

    expect(skeleton.bones[0].worldX).toBeCloseTo(15)
    expect(skeleton.bones[0].worldY).toBeCloseTo(17)
    expect(skeleton.bones[1].worldX).toBeCloseTo(15)
    expect(skeleton.bones[1].worldY).toBeCloseTo(19)

    skeleton.bones[0].rotation = 0
    updateSpineWorldTransform(runtime, skeleton)

    expect(skeleton.bones[1].worldX).toBeCloseTo(17)
    expect(skeleton.bones[1].worldY).toBeCloseTo(17)
  })

  it.each([
    ['4.0', spine40],
    ['4.1', spine41],
  ] as const)('rejects a Spine 4.2 skeleton with runtime %s', (_version, runtime) => {
    const skeleton = new spine42.Skeleton(new spine42.SkeletonData())
    const update = vi.spyOn(skeleton, 'updateWorldTransform')

    expect(() => updateSpineWorldTransform(runtime, skeleton)).toThrow('The skeleton does not belong to the selected Spine runtime.')
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a Spine 4.0 skeleton with runtime 4.2', () => {
    const skeleton = new spine40.Skeleton(new spine40.SkeletonData())
    const update = vi.spyOn(skeleton, 'updateWorldTransform')

    expect(() => updateSpineWorldTransform(spine42, skeleton)).toThrow('The skeleton does not belong to the selected Spine runtime.')
    expect(update).not.toHaveBeenCalled()
  })
})
