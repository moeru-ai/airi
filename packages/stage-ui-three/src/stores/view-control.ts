import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

import { DEFAULT_CAMERA_DISTANCE, DEFAULT_CAMERA_FOV, useThreeCamera } from './camera'

export const supportedControl = ['x', 'y', 'z', 'cameraDistance', 'cameraFOV'] as const
export type SupportedControl = typeof supportedControl[number]
interface ControlConfig { buttonText: string, default: number, max: number, min: number, step: number }

const formatMetersD2 = (val: number) => `${val.toFixed(2)}m`

export const defaultControlConfig: Record<SupportedControl, ControlConfig> = {
  cameraDistance: {
    buttonText: 'Dis',
    default: DEFAULT_CAMERA_DISTANCE,
    max: 10,
    min: 0,
    step: 0.01,
  },
  cameraFOV: {
    buttonText: 'FOV',
    default: DEFAULT_CAMERA_FOV,
    max: 120,
    min: 10,
    step: 1,
  },
  // TODO: allow user to set the min/max value
  x: {
    buttonText: 'X',
    default: 0,
    max: 10,
    min: -10,
    step: 0.01,
  },
  y: {
    buttonText: 'Y',
    default: 0,
    max: 10,
    min: -10,
    step: 0.01,
  },
  z: {
    buttonText: 'Z',
    default: 0,
    max: 10,
    min: -10,
    step: 0.01,
  },
}

export const formatter: Record<SupportedControl, (val: number) => string> = {
  cameraDistance: formatMetersD2,
  cameraFOV: (val: number) => `${val.toFixed(0)}°`,
  x: formatMetersD2,
  y: formatMetersD2,
  z: formatMetersD2,
}
const clampMinMax = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const { cameraDistance, cameraFOV } = useThreeCamera()
const controlConfig = ref(defaultControlConfig)
/** model position from the scene origin, in meters. */
const modelOffset = useLocalStorage('settings/stage-ui-three/modelOffset', { x: defaultControlConfig.x.default, y: defaultControlConfig.y.default, z: defaultControlConfig.z.default })
/**
 * show or hide the control element(slider) on HUD.
 *  also enable/disable camera panning.
 */
const viewControlsEnabled = ref(false)
/** what value to control for the control element */
const viewControlMode = ref<SupportedControl>('cameraDistance')

export function useThreeViewControl() {
  return {
    /** euclidean distance between the model center and the camera center, in meters. */
    cameraDistance,
    /** camera field of view, in degrees. */
    cameraFOV,
    controlConfig,
    /** model position from the scene origin, in meters. */
    modelOffset,
    /** reset the given control to its default value. */
    set,
    /** what value to control for the control element */
    viewControlMode,
    /** show or hide the control element(slider) on HUD. */
    viewControlsEnabled,
  }
}

/**
 * set the given control to the given value.
 *  @param key the control to set
 *  @param value optional, will reset the value to its default if not provided
 */
function set(key: SupportedControl, value?: number) {
  const clamped = value !== undefined ? clampMinMax(value, defaultControlConfig[key].min, defaultControlConfig[key].max) : undefined
  switch (key) {
    case 'cameraDistance':
      cameraDistance.value = clamped ?? defaultControlConfig.cameraDistance.default
      break
    case 'cameraFOV':
      cameraFOV.value = clamped ?? defaultControlConfig.cameraFOV.default
      break
    case 'x':
      modelOffset.value.x = clamped ?? defaultControlConfig.x.default
      break
    case 'y':
      modelOffset.value.y = clamped ?? defaultControlConfig.y.default
      break
    case 'z':
      modelOffset.value.z = clamped ?? defaultControlConfig.z.default
      break
  }
}
