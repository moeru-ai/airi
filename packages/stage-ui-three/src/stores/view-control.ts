import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

import { DEFAULT_CAMERA_DISTANCE, DEFAULT_CAMERA_FOV, useThreeCamera } from './camera'

export const supportedControl = ['x', 'y', 'z', 'cameraDistance', 'cameraFOV'] as const
export type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, default: number, buttonText: string, format: (val: number) => string }

const formatDecimal2Meters = (val: number) => `${val.toFixed(2)}m`

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  // TODO: allow user to set the min/max value
  x: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    buttonText: 'X',
    format: formatDecimal2Meters,
  },
  y: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    buttonText: 'Y',
    format: formatDecimal2Meters,
  },
  z: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    buttonText: 'Z',
    format: formatDecimal2Meters,
  },
  cameraDistance: {
    min: 0,
    max: 10,
    step: 0.01,
    default: DEFAULT_CAMERA_DISTANCE,
    buttonText: 'Dis',
    format: formatDecimal2Meters,
  },
  cameraFOV: {
    min: 10,
    max: 120,
    step: 1,
    default: DEFAULT_CAMERA_FOV,
    buttonText: 'FOV',
    format: (val: number) => `${val.toFixed(0)}°`,
  },
}

const { cameraDistance, cameraFOV } = useThreeCamera()
/** model position from the scene origin, in meters. */
const modelOffset = useLocalStorage('settings/stage-ui-three/modelOffset', { x: controlConfig.x.default, y: controlConfig.y.default, z: controlConfig.z.default })
/** show or hide the control element(slider) on HUD. */
const viewControlsEnabled = ref(false)
/** what value to control for the control element */
const viewControlMode = ref<SupportedControl>('cameraDistance')

/**
 * set the given control to the given value.
 *  @param key the control to set
 *  @param value optional, will reset the value to its default if not provided
 */
function set(key: SupportedControl, value?: number) {
  switch (key) {
    case 'x':
      modelOffset.value.x = value ?? controlConfig.x.default
      break
    case 'y':
      modelOffset.value.y = value ?? controlConfig.y.default
      break
    case 'z':
      modelOffset.value.z = value ?? controlConfig.z.default
      break
    case 'cameraDistance':
      cameraDistance.value = value ?? controlConfig.cameraDistance.default
      break
    case 'cameraFOV':
      cameraFOV.value = value ?? controlConfig.cameraFOV.default
      break
  }
}

export function useThreeViewControl() {
  return {
    /** camera field of view, in degrees. */
    cameraFOV,
    /** euclidean distance between the model center and the camera center, in meters. */
    cameraDistance,
    /** model position from the scene origin, in meters. */
    modelOffset,
    /** show or hide the control element(slider) on HUD. */
    viewControlsEnabled,
    /** what value to control for the control element */
    viewControlMode,

    /** reset the given control to its default value. */
    set,
  }
}
