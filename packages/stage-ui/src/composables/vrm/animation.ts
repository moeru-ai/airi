import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { VRMCore } from '@pixiv/three-vrm-core'
import { createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { Object3D, Vector3 } from 'three'
import { randFloat } from 'three/src/math/MathUtils.js'
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

/**
 * This is to simulate idle eye saccades in a *pretty* naive way.
 * Not using any reactivity here as it's not yet needed.
 * Keeping it here as a composable for future extension.
 */
export function useIdleEyeSaccades() {
  let nextSaccadeAfter = -1
  let fixationTarget: Vector3 | undefined
  let timeSinceLastSaccade = 0

  const STEP = 400
  const P = [
    [0.075, 800],
    [0.110, 0],
    [0.125, 0],
    [0.140, 0],
    [0.125, 0],
    [0.050, 0],
    [0.040, 0],
    [0.030, 0],
    [0.020, 0],
    [1.000, 0],
  ]
  for (let i = 1; i < P.length; i++) {
    P[i][0] += P[i - 1][0]
    P[i][1] = P[i - 1][1] + STEP
  }

  function nextSaccadeTimeMs() {
    const r = Math.random()
    for (let i = 0; i < P.length; i++) {
      if (r <= P[i][0]) {
        return P[i][1] + Math.random() * STEP
      }
    }
    return P[P.length - 1][1] + Math.random() * STEP
  }

  // Just a naive vector generator - Simulating random content on a 27in monitor at 65cm distance
  function updateFixationTarget() {
    if (!fixationTarget) {
      fixationTarget = new Vector3(randFloat(-0.25, 0.25), randFloat(-0.2, 0.15), -0.65)
    }
    else {
      fixationTarget.set(randFloat(-0.25, 0.25), randFloat(-0.2, 0.15), -0.65)
    }
  }

  // Function to handle idle eye saccades
  function update(vrm: VRMCore | undefined, delta: number) {
    if (!vrm?.expressionManager || !vrm.lookAt)
      return

    if (timeSinceLastSaccade >= nextSaccadeAfter) {
      updateFixationTarget()
      timeSinceLastSaccade = 0
      nextSaccadeAfter = nextSaccadeTimeMs() / 1000
    }
    else if (!fixationTarget) {
      updateFixationTarget()
    }

    if (!vrm.lookAt.target) {
      vrm.lookAt.target = new Object3D()
    }
    vrm.lookAt.target.position.lerp(fixationTarget!, randFloat(0.2, 0.5))
    vrm.lookAt?.update(delta)
    timeSinceLastSaccade += delta
  }

  return { update }
}
