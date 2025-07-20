import type { VRMCore } from '@pixiv/three-vrm'
import type { Object3D, Scene } from 'three'

import { VRMUtils } from '@pixiv/three-vrm'
import { VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation'
import { Box3, Vector3 } from 'three'

import { useVRMLoader } from './loader'

interface GLTFUserdata extends Record<string, any> {
  vrmCore?: VRMCore
}

export async function loadVrm(model: string, options?: {
  positionOffset?: [number, number, number]
  fov?: number
  scene?: Scene
  lookAt?: boolean
  onProgress?: (progress: ProgressEvent<EventTarget>) => void | Promise<void>
}): Promise<{ _vrm: VRMCore, modelCenter: Vector3, modelSize: Vector3, initialCameraPosition: Vector3 } | undefined> {
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

  // Add to scene
  if (options?.scene)
    options.scene.add(_vrm.scene)

  // Move the VRM model centre to the (0, 0, 0)
  const box = new Box3().setFromObject(_vrm.scene)
  const modelSize = new Vector3()
  const modelCenter = new Vector3()
  box.getSize(modelSize)
  box.getCenter(modelCenter)
  modelCenter.negate()
  modelCenter.y -= modelSize.y / 5 // Adjust pivot to align chest with the origin

  // Set position
  if (options?.positionOffset) {
    _vrm.scene.position.set(
      modelCenter.x + options.positionOffset[0],
      modelCenter.y + options.positionOffset[1],
      modelCenter.z + options.positionOffset[2],
    )
  }
  else {
    _vrm.scene.position.set(modelCenter.x, modelCenter.y, modelCenter.z)
  }

  // Compute the initial camera position (once per loaded model)
  // In order to see the up-2/3 part fo the model, z = (y/3) / tan(fov/2)
  const fov = options?.fov ?? 40 // default fov = 40 degrees
  const radians = (fov / 2 * Math.PI) / 180
  const initialCameraPosition = new Vector3(
    modelSize.x / 16,
    modelSize.y / 6,
    -(modelSize.y / 3) / Math.tan(radians), // default z value
  )

  return {
    _vrm,
    modelCenter,
    modelSize,
    initialCameraPosition,
  }
}
