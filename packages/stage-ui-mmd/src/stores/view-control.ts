import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale', 'rotationY'] as const
interface ControlConfig { default: number, format: (val: number) => string, max: number, min: number, step: number }
type SupportedControl = typeof supportedControl[number]

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
  rotationY: { default: 0, format: formatDegrees, max: Math.PI, min: -Math.PI, step: 0.01 },
  scale: { default: 0.1, format: formatToPercent, max: 1, min: 0.01, step: 0.01 },
  x: { default: 0, format: formatUnits, max: 20, min: -20, step: 0.1 },
  y: { default: 0, format: formatUnits, max: 20, min: -20, step: 0.1 },
}

export function useMMDViewControl() {
  function reset(key: SupportedControl) {
    switch (key) {
      case 'rotationY':
        rotationY.value = controlConfig.rotationY.default
        break
      case 'scale':
        scale.value = controlConfig.scale.default
        break
      case 'x':
        position.value.x = controlConfig.x.default
        break
      case 'y':
        position.value.y = controlConfig.y.default
        break
    }
  }

  return {
    position,
    reset,
    rotationY,
    scale,
    viewControlMode,
    viewControlsEnabled,
  }
}
