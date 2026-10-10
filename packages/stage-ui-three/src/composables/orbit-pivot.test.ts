import { Bone, BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { OrbitPivotTransition, pickModelOrbitPivot } from './orbit-pivot'

const rect = { left: 20, top: 30, width: 400, height: 400 }
const center = { x: 220, y: 230 }

function scene() {
  const camera = new PerspectiveCamera(40, 1, 0.01, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  const group = new Group()
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  group.add(mesh)
  return { camera, group, mesh }
}

describe('model orbit pivot picking', () => {
  it('returns world coordinates through parent rotation, translation and scale', () => {
    const { camera, group } = scene()
    group.position.set(1, 0.4, -2)
    group.rotation.y = Math.PI / 4
    group.scale.setScalar(2)
    camera.position.set(1, 0.4, 5)
    camera.lookAt(1, 0.4, -2)
    const point = pickModelOrbitPivot(group, camera, center, rect)
    expect(point?.x).toBeCloseTo(1)
    expect(point?.y).toBeCloseTo(0.4)
    expect(point?.z).toBeCloseTo(-2 + Math.SQRT2)
  })

  it('ignores misses, invisible geometry, hidden collider materials and points outside the canvas', () => {
    const { camera, group, mesh } = scene()
    expect(pickModelOrbitPivot(group, camera, { x: -1, y: -1 }, rect)).toBeUndefined()
    expect(pickModelOrbitPivot(group, camera, { x: 21, y: 31 }, rect)).toBeUndefined()
    mesh.visible = false
    expect(pickModelOrbitPivot(group, camera, center, rect)).toBeUndefined()
    mesh.visible = true
    mesh.material.visible = false
    expect(pickModelOrbitPivot(group, camera, center, rect)).toBeUndefined()
  })

  it('refreshes bounds after animated bones move a skinned mesh into the ray', () => {
    const { camera, group, mesh } = scene()
    group.remove(mesh)
    const geometry = new BoxGeometry()
    const count = geometry.attributes.position.count
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4))
    const weights = new Float32Array(count * 4)
    for (let index = 0; index < count; index++)
      weights[index * 4] = 1
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
    const bone = new Bone()
    const skinned = new SkinnedMesh(geometry, new MeshBasicMaterial())
    skinned.add(bone)
    skinned.bind(new Skeleton([bone]))
    group.add(skinned)
    bone.position.x = 10
    group.updateMatrixWorld(true)
    skinned.computeBoundingSphere()
    bone.position.x = 0
    expect(pickModelOrbitPivot(group, camera, center, rect)?.z).toBeCloseTo(0.5)
  })
})

describe('orbit recentering', () => {
  it('eases camera and target together while preserving angle and distance', () => {
    const { camera } = scene()
    const target = new Vector3()
    const rotation = camera.quaternion.clone()
    const transition = new OrbitPivotTransition()
    transition.startAt(camera, target, new Vector3(1, 2, -1))
    expect(transition.update(camera, target, 0.1)).toBe(true)
    expect(target.toArray()).toEqual([0.5, 1, -0.5])
    expect(camera.position.distanceTo(target)).toBeCloseTo(5)
    expect(camera.quaternion.angleTo(rotation)).toBeCloseTo(0)
    expect(transition.update(camera, target, 0.1)).toBe(false)
    expect(target.toArray()).toEqual([1, 2, -1])
    expect(camera.position.toArray()).toEqual([1, 2, 4])
  })

  it('cancels on new input and restarts from the current view', () => {
    const { camera } = scene()
    const target = new Vector3()
    const transition = new OrbitPivotTransition()
    transition.startAt(camera, target, new Vector3(2, 0, 0))
    transition.update(camera, target, 0.1)
    transition.cancel()
    expect(transition.update(camera, target, 1)).toBe(false)
    expect(target.x).toBe(1)
    transition.startAt(camera, target, new Vector3())
    transition.update(camera, target, 0.2)
    expect(target.toArray()).toEqual([0, 0, 0])
    expect(camera.position.toArray()).toEqual([0, 0, 5])
  })

  it('respects reduced motion and rejects nonfinite targets', () => {
    const { camera } = scene()
    const target = new Vector3()
    const transition = new OrbitPivotTransition()
    transition.startAt(camera, target, new Vector3(1, 0, 0), true)
    expect(transition.update(camera, target, 0)).toBe(false)
    expect(target.x).toBe(1)
    transition.startAt(camera, target, new Vector3(Number.NaN, 0, 0))
    expect(transition.update(camera, target, 1)).toBe(false)
    expect(target.x).toBe(1)
  })
})

it('isolates inspection from shared camera feedback until a completed reset', () => {
  const { camera: first } = scene()
  const { camera: second } = scene()
  const firstTarget = new Vector3()
  const secondTarget = new Vector3()
  const transition = new OrbitPivotTransition()
  const shared = { position: first.position.clone(), distance: 5 }
  const publish = () => {
    if (transition.isInspectionActive)
      return
    shared.position.copy(first.position)
    shared.distance = first.position.distanceTo(firstTarget)
    second.position.copy(shared.position)
  }
  transition.startAt(first, firstTarget, new Vector3(1, 0, 0))
  for (let frame = 0; frame < 30; frame++) {
    transition.update(first, firstTarget, 1 / 60)
    publish()
  }
  expect(transition.isInspectionActive).toBe(true)
  expect(first.position.distanceTo(firstTarget)).toBeCloseTo(5)
  expect(second.position.distanceTo(secondTarget)).toBeCloseTo(5)
  expect(shared.position.toArray()).toEqual([0, 0, 5])
  transition.startAt(first, firstTarget, new Vector3(), false, true)
  transition.update(first, firstTarget, 0.1)
  transition.cancel()
  publish()
  expect(transition.isInspectionActive).toBe(true)
  expect(shared.position.toArray()).toEqual([0, 0, 5])
  transition.startAt(first, firstTarget, new Vector3(), false, true)
  transition.update(first, firstTarget, 0.2)
  publish()
  expect(transition.isInspectionActive).toBe(false)
  expect(firstTarget.toArray()).toEqual([0, 0, 0])
  expect(first.position.distanceTo(firstTarget)).toBeCloseTo(5)
  expect(second.position.distanceTo(secondTarget)).toBeCloseTo(5)
  transition.startAt(first, firstTarget, new Vector3(1, 0, 0))
  transition.clear()
  expect(transition.isInspectionActive).toBe(false)
})
