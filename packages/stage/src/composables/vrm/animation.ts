import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { VRMCore } from '@pixiv/three-vrm-core'
import { createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { useVRMLoader } from './loader'

export interface GLTFUserdata extends Record<string, any> {
  vrmAnimations: VRMAnimation[]
}

export async function loadVRMAnimation(url: string) {
  const loader = useVRMLoader()

  // load VRM Animation .vrma file
  const gltf = await loader.loadAsync(url)

  const userData = gltf.userData as GLTFUserdata
  if (!userData.vrmAnimations) {
    console.warn('No VRM animations found in the .vrma file')
    return
  }
  if (userData.vrmAnimations.length === 0) {
    console.warn('No VRM animations found in the .vrma file')
    return
  }

  return userData.vrmAnimations[0]
}

export async function clipFromVRMAnimation(vrm?: VRMCore, animation?: VRMAnimation) {
  if (!vrm) {
    console.warn('No VRM found')
    return
  }
  if (!animation) {
    return
  }

  // create animation clip
  return createVRMAnimationClip(animation, vrm)
}
