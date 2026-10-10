import type { Camera, Object3D, PerspectiveCamera } from 'three'

import { Mesh, Raycaster, SkinnedMesh, Vector2, Vector3 } from 'three'

/** Finds visible model geometry in world space, including the current skinned pose. Background clicks return undefined. */
export function pickModelOrbitPivot(model: Object3D, camera: Camera, point: { x: number, y: number }, rect: { left: number, top: number, width: number, height: number }) {
  if (rect.width <= 0 || rect.height <= 0)
    return undefined
  const x = (point.x - rect.left) / rect.width
  const y = (point.y - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1)
    return undefined
  model.updateWorldMatrix(true, true)
  camera.updateWorldMatrix(true, false)
  const meshes: Mesh[] = []
  model.traverseVisible((object) => {
    if (!(object instanceof Mesh))
      return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some(material => material.visible && material.opacity > 0))
      return
    // SkinnedMesh bounds otherwise retain an earlier pose and can reject a valid hand or head click.
    if (object instanceof SkinnedMesh) {
      object.computeBoundingSphere()
      object.computeBoundingBox()
    }
    meshes.push(object)
  })
  const raycaster = new Raycaster()
  raycaster.setFromCamera(new Vector2(x * 2 - 1, 1 - y * 2), camera)
  return raycaster.intersectObjects(meshes, false)[0]?.point.clone()
}

/** Translates camera and target together, preserving viewing direction and orbit distance throughout recentering. */
export class OrbitPivotTransition {
  private readonly start = new Vector3()
  private readonly destination = new Vector3()
  private readonly offset = new Vector3()
  private elapsed = 0
  private duration = 0
  private active = false
  private inspection = false
  private restoreShared = false

  /** Inspection changes stay local until a completed reset publishes a coherent shared camera and target. */
  get isInspectionActive() {
    return this.inspection
  }

  startAt(camera: PerspectiveCamera, target: Vector3, destination: Vector3, reducedMotion = false, restoreShared = false) {
    if (![destination.x, destination.y, destination.z].every(Number.isFinite))
      return
    this.inspection = true
    this.restoreShared = restoreShared
    this.start.copy(target)
    this.destination.copy(destination)
    this.offset.copy(camera.position).sub(target)
    this.elapsed = 0
    this.duration = reducedMotion ? 0 : 0.2
    this.active = true
  }

  cancel() {
    this.active = false
  }

  /** Model changes discard local inspection and resume the shared camera. */
  clear() {
    this.active = false
    this.inspection = false
    this.restoreShared = false
  }

  update(camera: PerspectiveCamera, target: Vector3, delta: number) {
    if (!this.active)
      return false
    this.elapsed += Math.max(0, delta)
    const progress = this.duration ? Math.min(1, this.elapsed / this.duration) : 1
    const eased = progress * progress * (3 - 2 * progress)
    target.lerpVectors(this.start, this.destination, eased)
    camera.position.copy(target).add(this.offset)
    camera.updateMatrixWorld()
    if (progress === 1) {
      this.active = false
      if (this.restoreShared)
        this.inspection = false
    }
    return this.active
  }
}
