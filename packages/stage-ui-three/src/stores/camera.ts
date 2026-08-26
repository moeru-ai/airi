import { useLocalStorage } from '@vueuse/core'

export const DEFAULT_CAMERA_FOV = 40
export const DEFAULT_CAMERA_DISTANCE = 1
export const DEFAULT_CAMERA_POSITION = { x: 0, y: 0, z: -1 }

/** camera field of view, in degrees. */
const cameraFOV = useLocalStorage('settings/stage-ui-three/cameraFOV', DEFAULT_CAMERA_FOV)
/**
 * euclidean distance between the model center and the camera center, in meters.
 * setting this value will move the camera along the axis.
 */
const cameraDistance = useLocalStorage('settings/stage-ui-three/cameraDistance', DEFAULT_CAMERA_DISTANCE)
/**
 * Internal state of the camera. Users should not be able to set this directly, use `cameraDistance` instead.
 */
const cameraPosition = useLocalStorage('settings/stage-ui-three/camera-position', { ...DEFAULT_CAMERA_POSITION })

export function useThreeCamera() {
  return {
    cameraFOV,
    cameraDistance,
    cameraPosition,
  }
}
