import { useModelScopedLocalStorage } from '@proj-airi/stage-shared/composables'

export const DEFAULT_CAMERA_FOV = 40
export const DEFAULT_CAMERA_DISTANCE = 1
export const DEFAULT_CAMERA_POSITION = { x: 0, y: 0, z: -1 }

/** camera field of view, in degrees. */
const cameraFOV = useModelScopedLocalStorage('three', 'settings/stage-ui-three/cameraFOV', DEFAULT_CAMERA_FOV)
/**
 * euclidean distance between the model center and the camera center, in meters.
 * setting this value will move the camera along the axis.
 */
const cameraDistance = useModelScopedLocalStorage('three', 'settings/stage-ui-three/cameraDistance', DEFAULT_CAMERA_DISTANCE)
/**
 * Internal state of the camera. Users should not be able to set this directly, use `cameraDistance` instead.
 */
const cameraPosition = useModelScopedLocalStorage('three', 'settings/stage-ui-three/camera-position', { ...DEFAULT_CAMERA_POSITION })

export function useThreeCamera() {
  return {
    cameraFOV,
    cameraDistance,
    cameraPosition,
  }
}
