import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { VRMCore } from '@pixiv/three-vrm-core'
import { createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { ref } from 'vue'
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

export function useBlink() {
  /**
   * Eye blinking animation
   */
  const isBlinking = ref(false)
  const blinkProgress = ref(0)
  const timeSinceLastBlink = ref(0)
  const BLINK_DURATION = 0.2 // Duration of a single blink in seconds
  const MIN_BLINK_INTERVAL = 1 // Minimum time between blinks
  const MAX_BLINK_INTERVAL = 6 // Maximum time between blinks
  const nextBlinkTime = ref(Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL) + MIN_BLINK_INTERVAL)

  // Function to handle blinking animation
  function update(vrm: VRMCore | undefined, delta: number) {
    if (!vrm?.expressionManager)
      return

    timeSinceLastBlink.value += delta

    // Check if it's time for next blink
    if (!isBlinking.value && timeSinceLastBlink.value >= nextBlinkTime.value) {
      isBlinking.value = true
      blinkProgress.value = 0
    }

    // Handle blinking animation
    if (isBlinking.value) {
      blinkProgress.value += delta / BLINK_DURATION

      // Calculate blink value using sine curve for smooth animation
      const blinkValue = Math.sin(Math.PI * blinkProgress.value)

      // Apply blink expression
      vrm.expressionManager.setValue('blink', blinkValue)

      // Reset blink when animation is complete
      if (blinkProgress.value >= 1) {
        isBlinking.value = false
        timeSinceLastBlink.value = 0
        vrm.expressionManager.setValue('blink', 0) // Reset blink value to 0
        nextBlinkTime.value = Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL) + MIN_BLINK_INTERVAL
      }
    }
  }

  return { update }
}
