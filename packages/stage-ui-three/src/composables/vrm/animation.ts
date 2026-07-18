import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationClip } from 'three'
import type { Ref } from 'vue'

import { createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { Object3D, Vector3, VectorKeyframeTrack } from 'three'
import { randFloat } from 'three/src/math/MathUtils.js'
import { ref } from 'vue'

import { useVRMLoader } from './loader'
import { randomSaccadeInterval } from './utils/eye-motions'

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

// Set initial positions for animation
export function reAnchorRootPositionTrack(clip: AnimationClip, _vrm: VRMCore) {
// Get the hips node to re-anchor the root position track
  const hipNode = _vrm.humanoid?.getNormalizedBoneNode('hips')
  if (!hipNode) {
    console.warn('No hips node found in VRM model.')
    return
  }
  hipNode.updateMatrixWorld(true)
  const defaultHipPos = new Vector3()
  hipNode.getWorldPosition(defaultHipPos)

  // Calculate the offset from the hips node to the hips's first frame position
  const hipsTrack = clip.tracks.find(track =>
    track instanceof VectorKeyframeTrack
    && track.name === `${hipNode.name}.position`,
  )
  if (!(hipsTrack instanceof VectorKeyframeTrack)) {
    console.warn('No Hips.position track of type VectorKeyframeTrack found in animation.')
    return
  }

  const animeHipPos = new Vector3(
    hipsTrack.values[0],
    hipsTrack.values[1],
    hipsTrack.values[2],
  )
  const animeDelta = new Vector3().subVectors(animeHipPos, defaultHipPos)

  clip.tracks.forEach((track) => {
    if (track.name.endsWith('.position') && track instanceof VectorKeyframeTrack) {
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] -= animeDelta.x
        track.values[i + 1] -= animeDelta.y
        track.values[i + 2] -= animeDelta.z
      }
    }
  })
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
  const fixationTarget = new Vector3()
  let timeSinceLastSaccade = 0

  // Just a naive vector generator - Simulating random content on a 27in monitor at 65cm distance
  function updateFixationTarget(lookAtTarget: Ref<{ x: number, y: number, z: number }>) {
    fixationTarget.set(
      lookAtTarget.value.x + randFloat(-0.25, 0.25),
      lookAtTarget.value.y + randFloat(-0.25, 0.25),
      lookAtTarget.value.z,
    )
  }

  // Function to handle idle eye saccades
  function update(vrm: VRMCore | undefined, lookAtTarget: Ref<{ x: number, y: number, z: number }>, delta: number) {
    if (!vrm?.expressionManager || !vrm.lookAt)
      return

    if (timeSinceLastSaccade >= nextSaccadeAfter) {
      updateFixationTarget(lookAtTarget)
      timeSinceLastSaccade = 0
      nextSaccadeAfter = randomSaccadeInterval() / 1000
    }
    else if (!fixationTarget) {
      updateFixationTarget(lookAtTarget)
    }

    if (!vrm.lookAt.target) {
      // TODO: after bumping up to three 0.180.0 with @types/three 0.180.0,
      //   Argument of type 'Object3D<Object3DEventMap>' is not assignable to parameter of type 'Object3D<Object3DEventMap>'.
      //     Type 'Object3D<Object3DEventMap>' is missing the following properties from type 'Object3D<Object3DEventMap>': setPointerCapture, releasePointerCapture, hasPointerCapture
      //
      // Currently, AFAIK, https://github.com/pmndrs/xr/blob/456aa380206e93888cd3a5741a1534e672ae3106/packages/pointer-events/src/pointer.ts#L69-L100 declares
      // declare module 'three' {
      //   interface Object3D {
      //     setPointerCapture(pointerId: number): void
      //     releasePointerCapture(pointerId: number): void
      //     hasPointerCapture(pointerId: number): boolean

      //     intersectChildren?: boolean
      //     interactableDescendants?: Array<Object3D>
      //     /**
      //      * @deprecated
      //      */
      //     ancestorsHaveListeners?: boolean
      //     ancestorsHavePointerListeners?: boolean
      //     ancestorsHaveWheelListeners?: boolean
      //   }
      // }
      //
      // And in @tresjs/core v5, it uses the @pmndrs/pointer-events internally.
      // Somehow the Object3D from @types/three and the one augmented by @pmndrs/pointer-events are not compatible.
      // This needs to be fixed later.
      vrm.lookAt.target = new Object3D() as unknown as Object3D
    }

    vrm.lookAt.target?.position.lerp(fixationTarget!, 1)
    vrm.lookAt?.update(delta)

    timeSinceLastSaccade += delta
  }

  function instantUpdate(vrm: VRMCore | undefined, lookAtTarget: { x: number, y: number, z: number }) {
    fixationTarget.set(
      lookAtTarget.x,
      lookAtTarget.y,
      lookAtTarget.z,
    )
    if (!vrm?.expressionManager || !vrm.lookAt)
      return
    if (!vrm.lookAt.target) {
      // TODO: after bumping up to three 0.180.0 with @types/three 0.180.0,
      //   Argument of type 'Object3D<Object3DEventMap>' is not assignable to parameter of type 'Object3D<Object3DEventMap>'.
      //     Type 'Object3D<Object3DEventMap>' is missing the following properties from type 'Object3D<Object3DEventMap>': setPointerCapture, releasePointerCapture, hasPointerCapture
      //
      // Currently, AFAIK, https://github.com/pmndrs/xr/blob/456aa380206e93888cd3a5741a1534e672ae3106/packages/pointer-events/src/pointer.ts#L69-L100 declares
      // declare module 'three' {
      //   interface Object3D {
      //     setPointerCapture(pointerId: number): void
      //     releasePointerCapture(pointerId: number): void
      //     hasPointerCapture(pointerId: number): boolean

      //     intersectChildren?: boolean
      //     interactableDescendants?: Array<Object3D>
      //     /**
      //      * @deprecated
      //      */
      //     ancestorsHaveListeners?: boolean
      //     ancestorsHavePointerListeners?: boolean
      //     ancestorsHaveWheelListeners?: boolean
      //   }
      // }
      //
      // And in @tresjs/core v5, it uses the @pmndrs/pointer-events internally.
      // Somehow the Object3D from @types/three and the one augmented by @pmndrs/pointer-events are not compatible.
      // This needs to be fixed later.
      vrm.lookAt.target = new Object3D() as unknown as Object3D
    }

    vrm.lookAt.target?.position.lerp(fixationTarget!, 1)
    vrm.lookAt?.update(0.016)
  }

  return { update, instantUpdate }
}
