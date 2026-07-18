import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

import { DEFAULT_CAMERA_DISTANCE, DEFAULT_CAMERA_FOV, useThreeCamera } from './camera'

export const supportedControl = ['x', 'y', 'z', 'cameraDistance', 'cameraFOV'] as const
export type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, default: number, buttonText: string }

const formatMetersD2 = (val: number) => `${val.toFixed(2)}m`

export const defaultControlConfig: Record<SupportedControl, ControlConfig> = {
  // TODO: allow user to set the min/max value
  x: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    buttonText: 'X',
  },
  y: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    buttonText: 'Y',
  },
  z: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    buttonText: 'Z',
  },
  cameraDistance: {
    min: 0,
    max: 10,
    step: 0.01,
    default: DEFAULT_CAMERA_DISTANCE,
    buttonText: 'Dis',
  },
  cameraFOV: {
    min: 10,
    max: 120,
    step: 1,
    default: DEFAULT_CAMERA_FOV,
    buttonText: 'FOV',
  },
}

export const formatter: Record<SupportedControl, (val: number) => string> = {
  x: formatMetersD2,
  y: formatMetersD2,
  z: formatMetersD2,
  cameraDistance: formatMetersD2,
  cameraFOV: (val: number) => `${val.toFixed(0)}°`,
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

/**
 * set the given control to the given value.
 *  @param key the control to set
 *  @param value optional, will reset the value to its default if not provided
 */
function set(key: SupportedControl, value?: number) {
  const clamped = value !== undefined ? clampMinMax(value, defaultControlConfig[key].min, defaultControlConfig[key].max) : undefined
  switch (key) {
    case 'x':
      modelOffset.value.x = clamped ?? defaultControlConfig.x.default
      break
    case 'y':
      modelOffset.value.y = clamped ?? defaultControlConfig.y.default
      break
    case 'z':
      modelOffset.value.z = clamped ?? defaultControlConfig.z.default
      break
    case 'cameraDistance':
      cameraDistance.value = clamped ?? defaultControlConfig.cameraDistance.default
      break
    case 'cameraFOV':
      cameraFOV.value = clamped ?? defaultControlConfig.cameraFOV.default
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
    controlConfig,
    /** reset the given control to its default value. */
    set,
  }
}
