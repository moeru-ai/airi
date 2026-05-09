import { useLocalStorage } from '@vueuse/core'

/** camera field of view, in degrees. */
const cameraFOV = useLocalStorage('settings/stage-ui-three/cameraFOV', 40)
/**
 * euclidean distance between the model center and the camera center, in meters.
 * setting this value will move the camera along the axis.
 */
const cameraDistance = useLocalStorage('settings/stage-ui-three/cameraDistance', 1)
/**
 * Internal state of the camera. Users should not be able to set this directly, use `cameraDistance` instead.
 */
const cameraPosition = useLocalStorage('settings/stage-ui-three/camera-position', { x: 0, y: 0, z: -1 })

export function useThreeCamera() {
  return {
    cameraFOV,
    cameraDistance,
    cameraPosition,
  }
}
