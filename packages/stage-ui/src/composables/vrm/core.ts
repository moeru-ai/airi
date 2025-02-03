import type { VRMCore } from '@pixiv/three-vrm'
import type { Object3D, Scene } from 'three'
import { VRMUtils } from '@pixiv/three-vrm'

import { VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation'
import { useVRMLoader } from './loader'

interface GLTFUserdata extends Record<string, any> {
  vrmCore?: VRMCore
}

export async function loadVrm(model: string, options?: {
  position?: [number, number, number]
  scene?: Scene
  lookAt?: boolean
  onProgress?: (progress: ProgressEvent<EventTarget>) => void | Promise<void>
}): Promise<VRMCore | undefined> {
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

  // Set position
  if (options?.position)
    _vrm.scene.position.set(...options.position)

  return _vrm
}
