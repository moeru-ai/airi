import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'z', 'cameraDistance', 'cameraFOV'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, format: (val: number) => string }

const formatDecimal2Meters = (val: number) => `${val.toFixed(2)}m`

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  // TODO: allow user to set the min/max value
  x: {
    min: -10,
    max: 10,
    step: 0.01,
    format: formatDecimal2Meters,
  },
  y: {
    min: -10,
    max: 10,
    step: 0.01,
    format: formatDecimal2Meters,
  },
  z: {
    min: -10,
    max: 10,
    step: 0.01,
    format: formatDecimal2Meters,
  },
  cameraDistance: {
    min: 0,
    max: 10,
    step: 0.01,
    format: formatDecimal2Meters,
  },
  cameraFOV: {
    min: 10,
    max: 120,
    step: 1,
    format: (val: number) => `${val.toFixed(0)}°`,
  },
}

/** camera field of view, in degrees. */
const cameraFOV = useLocalStorageManualReset('settings/stage-ui-three/cameraFOV', 40)
/**
 * euclidean distance between the model center and the camera center, in meters.
 * setting this value will move the camera along the axis.
 */
const cameraDistance = useLocalStorageManualReset('settings/stage-ui-three/cameraDistance', 0.1)
/** model position from the scene origin, in meters. */
const modelOffset = useLocalStorageManualReset('settings/stage-ui-three/modelOffset', { x: 0, y: 0, z: 0 })
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
      modelOffset.value.x = 0
      break
    case 'y':
      modelOffset.value.y = 0
      break
    case 'z':
      modelOffset.value.z = 0
      break
    case 'cameraDistance':
      cameraDistance.reset()
      break
    case 'cameraFOV':
      cameraFOV.reset()
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
