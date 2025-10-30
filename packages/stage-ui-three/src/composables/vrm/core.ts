import type { VRM, VRMCore } from '@pixiv/three-vrm'
import type { Mesh, Object3D, Scene } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation'
import { Box3, Group, Quaternion, Vector3 } from 'three'

import { useVRMLoader } from './loader'

interface GLTFUserdata extends Record<string, any> {
  vrmCore?: VRMCore
}

export async function loadVrm(model: string, options?: {
  scene?: Scene
  lookAt?: boolean
  onProgress?: (progress: ProgressEvent<EventTarget>) => void | Promise<void>
}): Promise<{
  _vrm: VRM
  _vrmGroup: Group
  modelCenter: Vector3
  modelSize: Vector3
  initialCameraOffset: Vector3
} | undefined> {
  const loader = useVRMLoader()
  const gltf = await loader.loadAsync(model, progress => options?.onProgress?.(progress))

  const userData = gltf.userData as GLTFUserdata
  if (!userData.vrm) {
    return
  }

  const _vrm = userData.vrm

  // calling these functions greatly improves the performance
  VRMUtils.removeUnnecessaryVertices(_vrm.scene)
  VRMUtils.combineSkeletons(_vrm.scene)

  // Disable frustum culling
  _vrm.scene.traverse((object: Object3D) => {
    object.frustumCulled = false
  })

  // Add look at quaternion proxy to the VRM; which is needed to play the look at animation
  if (options?.lookAt && _vrm.lookAt) {
    const lookAtQuatProxy = new VRMLookAtQuaternionProxy(_vrm.lookAt)
    lookAtQuatProxy.name = 'lookAtQuaternionProxy'
    _vrm.scene.add(lookAtQuatProxy)
  }

  const _vrmGroup = new Group()
  _vrmGroup.add(_vrm.scene)
  // Add to scene
  if (options?.scene) {
    options.scene.add(_vrmGroup)
  }

  // Preset the facing direction
  const targetDirection = new Vector3(0, 0, -1) // Default facing direction
  const lookAt = _vrm.lookAt
  const quaternion = new Quaternion()
  if (lookAt) {
    const facingDirection = lookAt.faceFront
    quaternion.setFromUnitVectors(facingDirection.normalize(), targetDirection.normalize())
    _vrmGroup.quaternion.premultiply(quaternion)
    _vrmGroup.updateMatrixWorld(true)
  }
  else {
    console.warn('No look-at target found in VRM model')
  }
  (_vrm as VRM).springBoneManager?.reset()
  _vrmGroup.updateMatrixWorld(true)

  function computeBoundingBox(vrm: Object3D) {
    const box = new Box3()
    const childBox = new Box3()

    vrm.updateMatrixWorld(true)

    vrm.traverse((obj) => {
      if (!obj.visible)
        return
      const mesh = obj as Mesh
      if (!mesh.isMesh)
        return
      if (!mesh.geometry)
        return
      // This traverse mesh console print will be important for future debugging
      // console.debug("mesh node: ", mesh)

      // Selectively filter out VRM spring bone colliders
      if (mesh.name.startsWith('VRMC_springBone_collider'))
        return

      const geometry = mesh.geometry
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox()
      }

      childBox.copy(geometry.boundingBox!)
      childBox.applyMatrix4(mesh.matrixWorld)

      box.union(childBox)
    })

    return box
  }

  const box = computeBoundingBox(_vrm.scene)
  const modelSize = new Vector3()
  const modelCenter = new Vector3()
  box.getSize(modelSize)
  box.getCenter(modelCenter)
  modelCenter.y += modelSize.y / 5 // Adjust pivot to align chest with the origin

  // Compute the initial camera position (once per loaded model)
  // In order to see the up-2/3 part fo the model, z = (y/3) / tan(fov/2)
  const fov = 40 // default fov = 40 degrees
  const radians = (fov / 2 * Math.PI) / 180
  const initialCameraOffset = new Vector3(
    modelSize.x / 16,
    modelSize.y / 8, // default y value
    -(modelSize.y / 3) / Math.tan(radians), // default z value
  )

  return {
    _vrm,
    _vrmGroup,
    modelCenter,
    modelSize,
    initialCameraOffset,
  }
}
