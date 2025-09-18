import type { VRMCore } from '@pixiv/three-vrm'
import type { Object3D, Scene } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation'
import { Box3, Group, Vector3 } from 'three'

import { useVRMLoader } from './loader'

interface GLTFUserdata extends Record<string, any> {
  vrmCore?: VRMCore
}

export async function loadVrm(model: string, options?: {
  scene?: Scene
  lookAt?: boolean
  onProgress?: (progress: ProgressEvent<EventTarget>) => void | Promise<void>
}): Promise<{
  _vrm: VRMCore
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

  const box = new Box3().setFromObject(_vrm.scene)
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
    modelSize.y / 6, // default y value
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
