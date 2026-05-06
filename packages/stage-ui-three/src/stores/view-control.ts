import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'z', 'cameraDistance', 'cameraFOV'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, default: number, format: (val: number) => string }

const formatDecimal2Meters = (val: number) => `${val.toFixed(2)}m`

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  // TODO: allow user to set the min/max value
  x: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    format: formatDecimal2Meters,
  },
  y: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    format: formatDecimal2Meters,
  },
  z: {
    min: -10,
    max: 10,
    step: 0.01,
    default: 0,
    format: formatDecimal2Meters,
  },
  cameraDistance: {
    min: 0,
    max: 10,
    step: 0.01,
    default: 1,
    format: formatDecimal2Meters,
  },
  cameraFOV: {
    min: 10,
    max: 120,
    step: 1,
    default: 40,
    format: (val: number) => `${val.toFixed(0)}°`,
  },
}

/** camera field of view, in degrees. */
const cameraFOV = useLocalStorage('settings/stage-ui-three/cameraFOV', 40)
/**
 * euclidean distance between the model center and the camera center, in meters.
 * setting this value will move the camera along the axis.
 */
const cameraDistance = useLocalStorage('settings/stage-ui-three/cameraDistance', 1)
/** model position from the scene origin, in meters. */
const modelOffset = useLocalStorage('settings/stage-ui-three/modelOffset', { x: 0, y: 0, z: 0 })
/** show or hide the control element(slider) on HUD. */
const viewControlsEnabled = ref(false)
/** what value to control for the control element */
const viewControlMode = ref<SupportedControl>('cameraDistance')

/**
 * reset the given control to its default value.
 *  @param key the control to reset
 */
function reset(key: SupportedControl) {
  switch (key) {
    case 'x':
      modelOffset.value.x = controlConfig.x.default
      break
    case 'y':
      modelOffset.value.y = controlConfig.y.default
      break
    case 'z':
      modelOffset.value.z = controlConfig.z.default
      break
    case 'cameraDistance':
      cameraDistance.value = controlConfig.cameraDistance.default
      break
    case 'cameraFOV':
      cameraFOV.value = controlConfig.cameraFOV.default
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
    reset,
  }
}
