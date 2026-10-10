import type { SceneMotionFramingResult, SceneMotionFramingTick } from './scene-motion-framing'

import { Bone, Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { SceneMotionFraming } from './scene-motion-framing'

function fixture(size = 1) {
  const root = new Group()
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial())
  root.add(mesh)
  const camera = new PerspectiveCamera(50, 1, 0.01, 1000)
  camera.position.z = 5
  camera.updateMatrixWorld(true)
  const adapter = new SceneMotionFraming('model-1')
  const input: SceneMotionFramingTick = {
    modelId: 'model-1',
    motionRevision: 0,
    cameraRevision: 0,
    manualControl: false,
    nowMs: 0,
    root,
    camera,
    anchorWorld: new Vector3(),
  }
  return { root, mesh, camera, adapter, input }
}

function applied(result: SceneMotionFramingResult) {
  expect(result.status).toBe('applied')
  if (result.status !== 'applied')
    throw new Error('Expected an applied framing result')
  return result
}

function skinnedTriangle() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0], 3))
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
  const bone = new Bone()
  mesh.add(bone)
  mesh.bind(new Skeleton([bone]))
  return { mesh, bone }
}

describe('scene motion framing', () => {
  it('applies a world-space offset while preserving projection, quaternion, and screen anchor', () => {
    const { adapter, input, camera } = fixture(6)
    input.anchorWorld.set(0.4, -0.4, 0)
    const before = input.anchorWorld.clone().project(camera)
    const projection = camera.projectionMatrix.clone()
    const quaternion = camera.quaternion.clone()
    const result = applied(adapter.tick(input))
    expect(result.factor).toBeGreaterThan(1)
    expect(result.sampled).toBe(true)
    expect(result.limited).toBe(false)
    const after = input.anchorWorld.clone().project(camera)
    expect(after.x).toBeCloseTo(before.x, 12)
    expect(after.y).toBeCloseTo(before.y, 12)
    expect(camera.projectionMatrix.equals(projection)).toBe(true)
    expect(camera.quaternion.equals(quaternion)).toBe(true)
    expect(camera.zoom).toBe(1)
  })

  it('never compounds its own offsets over repeated frames', () => {
    const { adapter, input, camera } = fixture(6)
    const initial = applied(adapter.tick(input))
    const position = camera.position.clone()
    for (let i = 1; i < 100; i++) {
      expect(applied(adapter.tick({ ...input, nowMs: i * 16 })).factor).toBe(initial.factor)
      expect(camera.position.distanceTo(position)).toBeLessThan(1e-10)
    }
  })

  it('converts positions correctly through a rotated and scaled camera parent', () => {
    const { adapter, input, camera } = fixture(6)
    const parent = new Group()
    parent.position.set(2, 1, -2)
    parent.rotation.y = 0.2
    parent.scale.set(1.2, 1.2, 1.2)
    parent.add(camera)
    parent.updateMatrixWorld(true)
    input.anchorWorld.set(2, 1, -2)
    const before = input.anchorWorld.clone().project(camera)
    const quaternion = camera.quaternion.clone()
    applied(adapter.tick(input))
    const after = input.anchorWorld.clone().project(camera)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
    expect(camera.quaternion.equals(quaternion)).toBe(true)
  })

  it('retains the un-offset baseline across repeated viewport and lens revisions', () => {
    const { adapter, input, camera } = fixture(4)
    applied(adapter.tick(input))
    for (let i = 1; i <= 10; i++) {
      camera.aspect = i % 2 === 0 ? 1 : 0.5
      camera.updateProjectionMatrix()
      const actual = applied(adapter.tick({ ...input, cameraRevision: i, nowMs: i * 100 }))
      const comparison = fixture(4)
      comparison.camera.aspect = camera.aspect
      comparison.camera.updateProjectionMatrix()
      const expected = applied(comparison.adapter.tick(comparison.input))
      expect(actual.factor).toBeCloseTo(expected.factor, 10)
      expect(camera.position.z).toBeCloseTo(comparison.camera.position.z, 10)
    }
  })

  it('captures an externally changed camera pose as a new explicit baseline', () => {
    const { adapter, input, camera } = fixture(4)
    applied(adapter.tick(input))
    camera.position.set(0, 0, 20)
    camera.updateMatrixWorld(true)
    expect(applied(adapter.tick({ ...input, cameraRevision: 1, nowMs: 100 })).factor).toBe(1)
    expect(camera.position.z).toBe(20)
  })

  it('yields to manual control until a new camera revision arrives', () => {
    const { adapter, input, camera } = fixture(4)
    applied(adapter.tick(input))
    camera.position.z = 20
    camera.updateMatrixWorld(true)
    expect(adapter.tick({ ...input, nowMs: 10, manualControl: true }).status).toBe('manual')
    expect(adapter.tick({ ...input, nowMs: 20 }).status).toBe('manual')
    expect(camera.position.z).toBe(20)
    expect(applied(adapter.tick({ ...input, nowMs: 30, cameraRevision: 1 })).factor).toBe(1)
  })

  it('treats unexpected position, orientation, or projection changes as manual ownership', () => {
    for (const change of ['position', 'orientation', 'projection'] as const) {
      const { adapter, input, camera } = fixture(4)
      applied(adapter.tick(input))
      if (change === 'position')
        camera.position.x += 0.25
      if (change === 'orientation')
        camera.rotation.y += 0.1
      if (change === 'projection') {
        camera.zoom = 1.5
        camera.updateProjectionMatrix()
      }
      camera.updateMatrixWorld(true)
      const world = camera.matrixWorld.clone()
      expect(adapter.tick({ ...input, nowMs: 10 }).status).toBe('manual')
      expect(camera.matrixWorld.equals(world)).toBe(true)
    }
  })

  it('restores only its own camera offset during reset', () => {
    const own = fixture(6)
    applied(own.adapter.tick(own.input))
    expect(own.camera.position.z).toBeGreaterThan(5)
    own.adapter.reset({ restore: true })
    expect(own.camera.position.z).toBe(5)
    const manual = fixture(6)
    applied(manual.adapter.tick(manual.input))
    manual.camera.position.z = 30
    manual.adapter.reset({ restore: true })
    expect(manual.camera.position.z).toBe(30)
  })

  it('samples deformed skinned meshes at a bounded cadence after bone movement', () => {
    const { adapter, input, root } = fixture()
    const { mesh, bone } = skinnedTriangle()
    root.add(mesh)
    const sample = vi.spyOn(mesh, 'computeBoundingBox')
    const first = applied(adapter.tick(input))
    expect(sample).toHaveBeenCalledTimes(1)
    bone.position.x = 8
    const cached = applied(adapter.tick({ ...input, nowMs: 50, motionRevision: 1 }))
    expect(cached.sampled).toBe(false)
    expect(cached.factor).toBe(first.factor)
    expect(sample).toHaveBeenCalledTimes(1)
    const updated = applied(adapter.tick({ ...input, nowMs: 100, motionRevision: 2 }))
    expect(updated.sampled).toBe(true)
    expect(updated.factor).toBeGreaterThan(first.factor)
    expect(sample).toHaveBeenCalledTimes(2)
  })

  it('includes current morph target deformation in visible mesh bounds', () => {
    const { adapter, input, root } = fixture()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0], 3))
    geometry.morphAttributes.position = [new Float32BufferAttribute([3, 0, 0, 3, 0, 0, 3, 0, 0], 3)]
    geometry.morphTargetsRelative = true
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    mesh.morphTargetInfluences![0] = 3
    root.add(mesh)
    expect(applied(adapter.tick(input)).factor).toBeGreaterThan(3)
  })

  it('ignores hidden ancestors, invisible materials, transparent meshes, and interaction colliders', () => {
    const { adapter, input, root } = fixture()
    const hidden = new Group()
    hidden.visible = false
    hidden.add(new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial()))
    root.add(hidden)
    root.add(new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial({ visible: false })))
    root.add(new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial({ transparent: true, opacity: 0 })))
    const collider = new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial())
    collider.name = 'vrm_interaction_head'
    root.add(collider)
    expect(applied(adapter.tick(input)).factor).toBe(1)
  })

  it('does not adjust the camera for an invisible model root or ancestor', () => {
    const { adapter, input, root, camera } = fixture(6)
    const hiddenParent = new Group()
    hiddenParent.visible = false
    hiddenParent.add(root)
    expect(adapter.tick(input).status).toBe('unavailable')
    expect(camera.position.z).toBe(5)
  })

  it.each(['maxNodes', 'maxMeshes', 'maxVertexVisits'] as const)('fails closed when the %s budget is exceeded', (option) => {
    const { input, root, camera } = fixture(6)
    root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()))
    const adapter = new SceneMotionFraming('model-1', { [option]: 1 })
    expect(adapter.tick(input).status).toBe('unavailable')
    expect(camera.position.z).toBe(5)
  })

  it('supports bounded instance transforms and rejects excessive instance counts', () => {
    const { input, root } = fixture()
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2)
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(6, 0, 0))
    mesh.setMatrixAt(1, new Matrix4())
    root.add(mesh)
    expect(applied(new SceneMotionFraming('model-1').tick(input)).factor).toBeGreaterThan(2)
    expect(new SceneMotionFraming('model-1', { maxInstances: 1 }).tick(input).status).toBe('unavailable')
  })

  it('rejects foreign models, stale revisions, invalid clocks, and singular roots', () => {
    const { adapter, input, root } = fixture()
    applied(adapter.tick(input))
    expect(adapter.tick({ ...input, modelId: 'other-model', nowMs: 1 }).status).toBe('stale')
    expect(adapter.tick({ ...input, nowMs: Number.NaN }).status).toBe('unavailable')
    expect(adapter.tick({ ...input, motionRevision: -1, nowMs: 1 }).status).toBe('stale')
    root.scale.x = 0
    expect(adapter.tick({ ...input, nowMs: 2 }).status).toBe('unavailable')
  })

  it.each([0.01, 100])('handles a nonstandard root scale of %s', (scale) => {
    const { adapter, input, root, camera } = fixture(6)
    root.scale.setScalar(scale)
    camera.position.z = 5 * scale
    camera.far = 1000 * Math.max(1, scale)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    const result = applied(adapter.tick(input))
    expect(result.factor).toBeGreaterThan(1)
    expect(result.limited).toBe(false)
    expect(camera.position.z / scale).toBeCloseTo(10.148, 2)
  })

  it('does not treat malformed preflight bounds as measured coverage', () => {
    const { adapter, input } = fixture()
    const invalid = new Box3(new Vector3(Number.NaN, 0, 0), new Vector3(1, 1, 1))
    expect(applied(adapter.tick({ ...input, motionActive: true, motionEnvelope: invalid })).limited).toBe(true)
  })

  it('rejects unsupported off-axis projections without touching the camera', () => {
    const { adapter, input, camera } = fixture(6)
    camera.setViewOffset(100, 100, 0, 0, 50, 100)
    expect(adapter.tick(input).status).toBe('unavailable')
    expect(camera.position.z).toBe(5)
  })

  it('preserves an intentional close-up on initial idle without sampling geometry', () => {
    const { adapter, input, camera } = fixture(6)
    const result = applied(adapter.tick({ ...input, motionActive: false }))
    expect(result.factor).toBe(1)
    expect(result.sampled).toBe(false)
    expect(camera.position.z).toBe(5)
  })

  it('waits for idle, then restores the original close-up smoothly and completely', () => {
    const { input, camera } = fixture(6)
    const adapter = new SceneMotionFraming('model-1', { shrinkDelayMs: 500, shrinkRate: 1 })
    const active = applied(adapter.tick({ ...input, motionActive: true }))
    const grown = camera.position.clone()
    expect(applied(adapter.tick({ ...input, motionActive: false, motionRevision: 1, nowMs: 100 })).factor).toBe(active.factor)
    expect(applied(adapter.tick({ ...input, motionActive: false, motionRevision: 1, nowMs: 599 })).factor).toBe(active.factor)
    const next = applied(adapter.tick({ ...input, motionActive: false, motionRevision: 1, nowMs: 600 }))
    expect(next.factor).toBeLessThan(active.factor)
    expect(next.factor).toBeGreaterThanOrEqual(active.factor - 0.1)
    expect(camera.position.z).toBeLessThan(grown.z)
    for (let i = 7; i <= 100; i++)
      adapter.tick({ ...input, motionActive: false, motionRevision: 1, nowMs: i * 100 })
    expect(camera.position.z).toBeCloseTo(5, 10)
  })

  it('cancels idle restoration when motion resumes or manual control starts', () => {
    const { input, camera } = fixture(6)
    const adapter = new SceneMotionFraming('model-1', { shrinkDelayMs: 0, shrinkRate: 1 })
    const active = applied(adapter.tick({ ...input, motionActive: true }))
    const idle = applied(adapter.tick({ ...input, motionActive: false, motionRevision: 1, nowMs: 100 }))
    expect(idle.factor).toBeLessThan(active.factor)
    const resumed = applied(adapter.tick({ ...input, motionActive: true, motionRevision: 2, nowMs: 200 }))
    expect(resumed.factor).toBeGreaterThanOrEqual(idle.factor)
    camera.position.set(0, 0, 30)
    expect(adapter.tick({ ...input, motionActive: false, motionRevision: 3, manualControl: true, nowMs: 300 }).status).toBe('manual')
    expect(adapter.tick({ ...input, motionActive: false, motionRevision: 3, nowMs: 1000 }).status).toBe('manual')
    expect(camera.position.z).toBe(30)
  })

  it('labels heuristic active-motion widening as limited and accepts real preflight bounds separately', () => {
    const heuristic = fixture()
    expect(applied(heuristic.adapter.tick({ ...heuristic.input, motionActive: true })).limited).toBe(true)
    const preflight = fixture()
    const motionEnvelope = new Box3(new Vector3(-3, -1, -1), new Vector3(3, 1, 1))
    const result = applied(preflight.adapter.tick({ ...preflight.input, motionActive: true, motionEnvelope }))
    expect(result.factor).toBeGreaterThan(1)
    expect(result.limited).toBe(false)
  })
})
