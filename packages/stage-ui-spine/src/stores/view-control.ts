import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, default: number, format: (val: number) => string }

const viewControlsEnabled = ref(false)
const viewControlMode = ref<SupportedControl>('scale')

/** model position relative to the centre of the screen, in pixels */
const position = useLocalStorage<{ x: number, y: number }>('settings/spine/position', { x: 0, y: 0 })
/** uniform model scaling. `1` means no scaling. */
const scale = useLocalStorage('settings/spine/scale', 1)

const formatPercentD1 = (val: number) => `${val.toFixed(1)}%`
const formatToPercent = (val: number) => `${(val * 100).toFixed(0)}%`

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  x: { min: -500, max: 500, step: 0.1, default: 0, format: formatPercentD1 },
  y: { min: -500, max: 500, step: 0.1, default: 0, format: formatPercentD1 },
  scale: { min: 0.01, max: 3, step: 0.01, default: 1, format: formatToPercent },
}

export function useSpineViewControl() {
  function reset(key: SupportedControl) {
    switch (key) {
      case 'x':
        position.value.x = controlConfig.x.default
        break
      case 'y':
        position.value.y = controlConfig.y.default
        break
      case 'scale':
        scale.value = controlConfig.scale.default
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
