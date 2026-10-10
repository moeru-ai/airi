import type { Material, Matrix4, Object3D, PerspectiveCamera } from 'three'

import type { FramingLens, MotionFramingOptions } from './motion-framing'

import { Box3, InstancedMesh, Mesh, SkinnedMesh, Vector3 } from 'three'

import { combineMotionEnvelopes, MotionFramingController, transformMotionEnvelope } from './motion-framing'

/** The caller ticks after animation, spring bones, and model transforms have been updated. */
export interface SceneMotionFramingTick {
  modelId: string
  motionRevision: number
  cameraRevision: number
  manualControl: boolean
  nowMs: number
  /** Stable envelope root. Live samples are converted into this root's local space. */
  root: Object3D
  camera: PerspectiveCamera
  /** A stable world-space point, such as the feet before the motion starts. */
  anchorWorld: Vector3
  /** True widens the reference envelope. False eases back to the saved view. Undefined keeps continuous fitting. @default undefined */
  motionActive?: boolean
  /** Optional real preflight envelope in root-local coordinates. */
  motionEnvelope?: Box3
}

/** Sampling budgets fail closed. Partial geometry never authorizes a new camera pose. */
export interface SceneMotionFramingOptions extends MotionFramingOptions {
  /** Milliseconds between live geometry samples. @default 100 */
  sampleIntervalMs?: number
  /** Maximum scene nodes visited per sample. @default 4096 */
  maxNodes?: number
  /** Maximum visible meshes sampled together. @default 256 */
  maxMeshes?: number
  /** Vertex visits, including active morph targets. @default 500000 */
  maxVertexVisits?: number
  /** Maximum transforms per instanced mesh. @default 256 */
  maxInstances?: number
}

/** `limited` reports fitting uncertainty, including unsampled active motion. Explicit idle restores the user's view instead of guaranteeing full-body coverage. */
export type SceneMotionFramingResult
  = { status: 'applied', factor: number, limited: boolean, sampled: boolean }
    | { status: 'manual' | 'stale' | 'unavailable', sampled: boolean }

interface Baseline {
  camera: PerspectiveCamera
  revision: number
  world: Matrix4
  projection: Matrix4
  lens: FramingLens
}

interface SampleResult {
  bounds: Box3 | undefined
  complete: boolean
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value!)) : fallback
}

function visibleMaterial(material: Material) {
  return material.visible && (!material.transparent || material.opacity > 0)
}

function validMatrix(matrix: Matrix4) {
  return matrix.elements.every(Number.isFinite) && Number.isFinite(matrix.determinant()) && matrix.determinant() !== 0
}

function sameMatrix(a: Matrix4, b: Matrix4) {
  return a.elements.every((value, index) => Math.abs(value - b.elements[index]!) <= Math.max(1, Math.abs(value)) * 1e-10)
}

function lensFor(camera: PerspectiveCamera): FramingLens {
  return { verticalFovDegrees: camera.fov, aspect: camera.aspect, zoom: camera.zoom, near: camera.near, far: camera.far }
}

function sameLens(a: FramingLens, b: FramingLens) {
  return a.verticalFovDegrees === b.verticalFovDegrees && a.aspect === b.aspect && a.zoom === b.zoom && a.near === b.near && a.far === b.far
}

/**
 * Applies bounded framing offsets to one loaded model's perspective camera. All offsets use a captured baseline, never the previous offset.
 * It preserves camera orientation, projection, zoom, and inspection pivots. Manual or unexpected camera changes require a new explicit camera revision.
 * Live samples cover visible meshes. Imported motion preflight remains a separate producer of `motionEnvelope`.
 */
export class SceneMotionFraming {
  private readonly framing: MotionFramingController
  private readonly sampleIntervalMs: number
  private readonly maxNodes: number
  private readonly maxMeshes: number
  private readonly maxVertexVisits: number
  private readonly maxInstances: number
  private readonly restoreDelayMs: number
  private readonly restoreRate: number
  private baseline: Baseline | undefined
  private lastApplied: Matrix4 | undefined
  private root: Object3D | undefined
  private liveBounds: Box3 | undefined
  private restBounds: Box3 | undefined
  private lastSampleAt = -Infinity
  private lastMotionRevision = -1
  private lastTime = -1
  private suspendedRevision: number | undefined
  private sampleComplete = false
  private idleSince: number | undefined
  private appliedFactor = 1
  private readonly appliedOffset = new Vector3()

  constructor(private readonly modelId: string, options: SceneMotionFramingOptions = {}) {
    this.framing = new MotionFramingController(modelId, options)
    this.sampleIntervalMs = bounded(options.sampleIntervalMs, 100, 16, 1000)
    this.maxNodes = Math.floor(bounded(options.maxNodes, 4096, 1, 16_384))
    this.maxMeshes = Math.floor(bounded(options.maxMeshes, 256, 1, 1024))
    this.maxVertexVisits = Math.floor(bounded(options.maxVertexVisits, 500_000, 1, 2_000_000))
    this.maxInstances = Math.floor(bounded(options.maxInstances, 256, 1, 1024))
    this.restoreDelayMs = bounded(options.shrinkDelayMs, 750, 0, 10_000)
    this.restoreRate = bounded(options.shrinkRate, 0.75, 0.01, 4)
  }

  /** Restores only a still-owned automatic offset. Manual camera changes are never undone. */
  reset(options: { restore?: boolean } = {}) {
    const baseline = this.baseline
    if (options.restore && baseline && this.suspendedRevision === undefined && this.lastApplied) {
      baseline.camera.updateWorldMatrix(true, false)
      if (sameMatrix(baseline.camera.matrixWorld, this.lastApplied)
        && sameMatrix(baseline.camera.projectionMatrix, baseline.projection)
        && sameLens(lensFor(baseline.camera), baseline.lens)) {
        this.applyPosition(baseline.camera, new Vector3().setFromMatrixPosition(baseline.world))
      }
    }
    this.framing.reset()
    this.baseline = undefined
    this.lastApplied = undefined
    this.root = undefined
    this.liveBounds = undefined
    this.restBounds = undefined
    this.lastSampleAt = -Infinity
    this.lastMotionRevision = -1
    this.lastTime = -1
    this.suspendedRevision = undefined
    this.sampleComplete = false
    this.idleSince = undefined
    this.appliedFactor = 1
    this.appliedOffset.set(0, 0, 0)
  }

  /** Geometry work stays within its cadence and per-sample budget, including rapid motion replacements. */
  tick(frame: SceneMotionFramingTick): SceneMotionFramingResult {
    if (frame.modelId !== this.modelId || frame.motionRevision < this.lastMotionRevision
      || (this.baseline && frame.cameraRevision < this.baseline.revision)
      || (this.suspendedRevision !== undefined && frame.cameraRevision < this.suspendedRevision) || frame.nowMs < this.lastTime) {
      return { status: 'stale', sampled: false }
    }
    if (!Number.isFinite(frame.nowMs) || frame.nowMs < 0
      || !Number.isSafeInteger(frame.cameraRevision) || frame.cameraRevision < 0
      || !Number.isSafeInteger(frame.motionRevision) || frame.motionRevision < 0
      || ![frame.anchorWorld.x, frame.anchorWorld.y, frame.anchorWorld.z].every(Number.isFinite)) {
      return { status: 'unavailable', sampled: false }
    }
    const delta = this.lastTime < 0 ? 0 : Math.min(0.1, (frame.nowMs - this.lastTime) / 1000)
    this.lastTime = frame.nowMs
    this.lastMotionRevision = frame.motionRevision
    if (frame.manualControl) {
      this.suspendedRevision = frame.cameraRevision
      return { status: 'manual', sampled: false }
    }
    if (this.suspendedRevision !== undefined && frame.cameraRevision <= this.suspendedRevision)
      return { status: 'manual', sampled: false }

    frame.camera.updateWorldMatrix(true, false)
    if (!validMatrix(frame.camera.matrixWorld) || frame.camera.view?.enabled || frame.camera.filmOffset !== 0)
      return { status: 'unavailable', sampled: false }
    if (!this.baseline || frame.cameraRevision !== this.baseline.revision) {
      const world = frame.camera.matrixWorld.clone()
      if (this.baseline?.camera === frame.camera && this.lastApplied && this.suspendedRevision === undefined
        && sameMatrix(frame.camera.matrixWorld, this.lastApplied)) {
        // Lens and viewport revisions retain the original position when only this adapter moved the camera.
        world.copyPosition(this.baseline.world)
      }
      else {
        this.appliedFactor = 1
        this.appliedOffset.set(0, 0, 0)
        this.idleSince = undefined
      }
      this.baseline = {
        camera: frame.camera,
        revision: frame.cameraRevision,
        world,
        projection: frame.camera.projectionMatrix.clone(),
        lens: lensFor(frame.camera),
      }
      this.lastApplied = frame.camera.matrixWorld.clone()
      this.suspendedRevision = undefined
    }
    const baseline = this.baseline
    if (frame.camera !== baseline.camera)
      return { status: 'unavailable', sampled: false }
    if (!this.lastApplied || !sameMatrix(frame.camera.matrixWorld, this.lastApplied)
      || !sameMatrix(frame.camera.projectionMatrix, baseline.projection) || !sameLens(lensFor(frame.camera), baseline.lens)) {
      this.suspendedRevision = frame.cameraRevision
      return { status: 'manual', sampled: false }
    }
    if (this.root && this.root !== frame.root)
      return { status: 'stale', sampled: false }
    this.root = frame.root
    frame.root.updateWorldMatrix(true, false)
    if (!validMatrix(frame.root.matrixWorld))
      return { status: 'unavailable', sampled: false }

    if (frame.motionActive === false)
      return this.restoreIdle(frame, baseline, delta)
    this.idleSince = undefined

    const sampled = frame.nowMs - this.lastSampleAt >= this.sampleIntervalMs
    if (sampled) {
      this.lastSampleAt = frame.nowMs
      const sample = this.sampleBounds(frame.root, frame.camera)
      this.liveBounds = sample.bounds
      this.sampleComplete = sample.complete
      if (!this.restBounds && sample.complete && sample.bounds)
        this.restBounds = sample.bounds.clone()
    }
    if (!this.sampleComplete || !this.liveBounds || !this.restBounds)
      return { status: 'unavailable', sampled }

    const preflightEnvelope = combineMotionEnvelopes([frame.motionEnvelope])
    let motionEnvelope = preflightEnvelope
    if (!motionEnvelope) {
      motionEnvelope = this.restBounds.clone()
      if (frame.motionActive) {
        // This headroom reduces live-sample latency. It is not a swept-pose guarantee for unmeasured clips.
        const size = motionEnvelope.getSize(new Vector3())
        const height = Math.max(size.x, size.y, size.z)
        motionEnvelope.expandByVector(new Vector3(height * 0.5, height * 0.25, height * 0.35))
      }
    }
    const rootInverse = frame.root.matrixWorld.clone().invert()
    const anchor = frame.anchorWorld.clone().applyMatrix4(rootInverse)
    const modelToBaselineCamera = baseline.world.clone().invert().multiply(frame.root.matrixWorld)
    const result = this.framing.update({
      modelId: frame.modelId,
      motionRevision: frame.motionRevision,
      cameraRevision: frame.cameraRevision,
      manualControl: false,
      nowMs: frame.nowMs,
      motionEnvelope,
      liveBounds: this.liveBounds,
      modelToBaselineCamera,
      anchor,
      lens: baseline.lens,
    })
    if (result.status !== 'ready')
      return { status: result.status, sampled }
    const position = result.solution.cameraOffset.clone().applyMatrix4(baseline.world)
    if (!this.applyPosition(frame.camera, position))
      return { status: 'unavailable', sampled }
    this.appliedFactor = result.solution.factor
    this.appliedOffset.copy(result.solution.cameraOffset)
    this.lastApplied = frame.camera.matrixWorld.clone()
    return { status: 'applied', factor: result.solution.factor, limited: result.solution.limited || (!!frame.motionActive && !preflightEnvelope), sampled }
  }

  private restoreIdle(frame: SceneMotionFramingTick, baseline: Baseline, delta: number): SceneMotionFramingResult {
    this.idleSince ??= frame.nowMs
    if (this.appliedFactor > 1 && frame.nowMs - this.idleSince >= this.restoreDelayMs) {
      const nextFactor = Math.max(1, this.appliedFactor - this.restoreRate * delta)
      const offset = this.appliedOffset.clone().multiplyScalar((nextFactor - 1) / (this.appliedFactor - 1))
      if (!this.applyPosition(frame.camera, offset.clone().applyMatrix4(baseline.world)))
        return { status: 'unavailable', sampled: false }
      this.appliedOffset.copy(offset)
      this.appliedFactor = nextFactor
      this.lastApplied = frame.camera.matrixWorld.clone()
      if (nextFactor === 1)
        this.framing.reset()
    }
    // Idle returns to the user's intentional view, which can be a close-up rather than a full-body composition.
    return { status: 'applied', factor: this.appliedFactor, limited: false, sampled: false }
  }

  private applyPosition(camera: PerspectiveCamera, worldPosition: Vector3) {
    if (camera.parent) {
      camera.parent.updateWorldMatrix(true, false)
      if (!validMatrix(camera.parent.matrixWorld))
        return false
      worldPosition.applyMatrix4(camera.parent.matrixWorld.clone().invert())
    }
    if (![worldPosition.x, worldPosition.y, worldPosition.z].every(Number.isFinite))
      return false
    camera.position.copy(worldPosition)
    camera.updateMatrixWorld(true)
    return true
  }

  private sampleBounds(root: Object3D, camera: PerspectiveCamera): SampleResult {
    let ancestor = root.parent
    let ancestors = 0
    while (ancestor) {
      if (!ancestor.visible || ++ancestors > this.maxNodes)
        return { bounds: undefined, complete: false }
      ancestor = ancestor.parent
    }
    const pending = [{ node: root, visible: true }]
    const meshes: Mesh[] = []
    let visited = 0
    while (pending.length > 0) {
      const { node, visible } = pending.pop()!
      if (++visited > this.maxNodes || pending.length + node.children.length > this.maxNodes - visited)
        return { bounds: undefined, complete: false }
      const rendered = visible && node.visible
      if (rendered && node instanceof Mesh && camera.layers.test(node.layers)) {
        const materialVisible = Array.isArray(node.material) ? node.material.some(visibleMaterial) : visibleMaterial(node.material)
        if (materialVisible && !node.name.startsWith('vrm_interaction_') && !node.name.startsWith('VRMC_springBone_collider')) {
          meshes.push(node)
          if (meshes.length > this.maxMeshes)
            return { bounds: undefined, complete: false }
        }
      }
      for (const child of node.children)
        pending.push({ node: child, visible: rendered })
    }
    // Traversal proved a bounded subtree. This updates SkinnedMesh bind inverses before CPU skinning reads bone matrices.
    root.updateMatrixWorld(true)
    const rootInverse = root.matrixWorld.clone().invert()
    const bounds: Box3[] = []
    let vertexVisits = 0
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position')
      if (!positions || !Number.isSafeInteger(positions.count) || positions.count <= 0)
        continue
      const activeMorphs = mesh.morphTargetInfluences?.filter(value => value !== 0).length ?? 0
      const morphs = mesh.geometry.morphAttributes.position?.length ?? 0
      vertexVisits += positions.count * (1 + Math.max(activeMorphs, morphs))
      if (vertexVisits > this.maxVertexVisits)
        return { bounds: undefined, complete: false }
      let local: Box3 | null
      try {
        if (mesh instanceof SkinnedMesh) {
          mesh.computeBoundingBox()
          local = mesh.boundingBox
        }
        else if (mesh instanceof InstancedMesh) {
          if (mesh.count > this.maxInstances || mesh.morphTexture)
            return { bounds: undefined, complete: false }
          mesh.geometry.computeBoundingBox()
          mesh.computeBoundingBox()
          local = mesh.boundingBox
        }
        else if (activeMorphs > 0) {
          local = new Box3()
          const vertex = new Vector3()
          for (let i = 0; i < positions.count; i++)
            local.expandByPoint(mesh.getVertexPosition(i, vertex))
        }
        else {
          mesh.geometry.computeBoundingBox()
          local = mesh.geometry.boundingBox
        }
      }
      catch {
        // Invalid imported geometry cannot change the user's camera or create a partial visibility claim.
        return { bounds: undefined, complete: false }
      }
      const transformed = local && transformMotionEnvelope(local, rootInverse.clone().multiply(mesh.matrixWorld))
      if (!transformed)
        return { bounds: undefined, complete: false }
      bounds.push(transformed)
    }
    const combined = combineMotionEnvelopes(bounds)
    return { bounds: combined, complete: !!combined }
  }
}
