import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'z', 'cameraDistance', 'cameraFOV'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, format: (val: number) => string }

const formatDecimal2 = (val: number) => val.toFixed(2)

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  x: {
    min: -10,
    max: 10,
    step: 0.01,
    format: formatDecimal2,
  },
  y: {
    min: -10,
    max: 10,
    step: 0.01,
    format: formatDecimal2,
  },
  z: {
    min: -10,
    max: 10,
    step: 0.01,
    format: formatDecimal2,
  },
  cameraDistance: {
    min: 0,
    max: 10,
    step: 0.01,
    format: formatDecimal2,
  },
  cameraFOV: {
    min: 10,
    max: 120,
    step: 1,
    format: (val: number) => val.toFixed(0),
  },
}

const cameraFOV = useLocalStorageManualReset('settings/stage-ui-three/cameraFOV', 40)
const cameraDistance = useLocalStorageManualReset('settings/stage-ui-three/cameraDistance', 0.1)
const modelOffset = useLocalStorageManualReset('settings/stage-ui-three/modelOffset', { x: 0, y: 0, z: 0 })
const viewControlsEnabled = ref(false)
const viewControlMode = ref<SupportedControl>('cameraDistance')

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
    cameraFOV,
    cameraDistance,
    modelOffset,
    viewControlsEnabled,
    viewControlMode,

    reset,
  }
}
