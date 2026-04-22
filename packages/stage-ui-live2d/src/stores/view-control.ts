import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, format: (val: number) => string }

const viewControlsEnabled = ref(false)
const viewControlMode = ref<SupportedControl>('scale')
const position = useLocalStorageManualReset<{ x: number, y: number }>('settings/live2d/position', { x: 0, y: 0 })
const scale = useLocalStorageManualReset('settings/live2d/scale', 1)

const formatDecimal0 = (val: number) => val.toFixed(0)

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  // TODO: calculate the min and max value dynamically according to window height/width, or allow user to set it
  x: {
    min: -1000,
    max: 1000,
    step: 1,
    format: formatDecimal0,
  },
  y: {
    min: -1000,
    max: 1000,
    step: 1,
    format: formatDecimal0,
  },
  scale: {
    min: 0.001,
    max: 3,
    step: 0.001,
    format: (val: number) => val.toFixed(2),
  },
}

export function useL2dViewControl() {
  const reset = (key: SupportedControl) => {
    switch (key) {
      case 'x':
        position.value.x = 0
        break
      case 'y':
        position.value.y = 0
        break
      case 'scale':
        scale.reset()
        break
    }
  }

  return {
    position,
    scale,
    reset,
    viewControlsEnabled,
    viewControlMode,
  }
}
