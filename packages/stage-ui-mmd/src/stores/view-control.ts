import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale', 'rotationY'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, default: number, format: (val: number) => string }

const viewControlsEnabled = ref(false)
const viewControlMode = ref<SupportedControl>('scale')

/** Model world offset from origin, in scene units. */
const position = useLocalStorage<{ x: number, y: number }>('settings/mmd/position', { x: 0, y: 0 })
/** Uniform model scale. MMD models are authored large, so default is small. */
const scale = useLocalStorage('settings/mmd/scale', 0.1)
/** Yaw applied to the model group, in radians. */
const rotationY = useLocalStorage('settings/mmd/rotationY', 0)

const formatUnits = (val: number) => val.toFixed(2)
const formatToPercent = (val: number) => `${(val * 100).toFixed(0)}%`
const formatDegrees = (val: number) => `${(val * 180 / Math.PI).toFixed(0)}°`

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  x: { min: -20, max: 20, step: 0.1, default: 0, format: formatUnits },
  y: { min: -20, max: 20, step: 0.1, default: 0, format: formatUnits },
  scale: { min: 0.01, max: 1, step: 0.01, default: 0.1, format: formatToPercent },
  rotationY: { min: -Math.PI, max: Math.PI, step: 0.01, default: 0, format: formatDegrees },
}

export function useMMDViewControl() {
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
      case 'rotationY':
        rotationY.value = controlConfig.rotationY.default
        break
    }
  }

  return {
    position,
    scale,
    rotationY,
    reset,
    viewControlsEnabled,
    viewControlMode,
  }
}
