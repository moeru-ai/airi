import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale'] as const
interface ControlConfig { default: number, format: (val: number) => string, max: number, min: number, step: number }
type SupportedControl = typeof supportedControl[number]

const viewControlsEnabled = ref(false)
const viewControlMode = ref<SupportedControl>('scale')

/** model position relative to the centre of the screen, in pixels */
const position = useLocalStorage<{ x: number, y: number }>('settings/spine/position', { x: 0, y: 0 })
/** uniform model scaling. `1` means no scaling. */
const scale = useLocalStorage('settings/spine/scale', 1)

const formatPixels = (val: number) => `${val.toFixed(0)}px`
const formatToPercent = (val: number) => `${(val * 100).toFixed(0)}%`

// Position is stored and applied in canvas pixels (see applyTransformFromStore
// in Model.vue: `skeleton.x = w / 2 + position.x`), so the x/y controls use a
// pixel range and formatter matching the settings panel sliders.
export const controlConfig: Record<SupportedControl, ControlConfig> = {
  scale: { default: 1, format: formatToPercent, max: 3, min: 0.1, step: 0.01 },
  x: { default: 0, format: formatPixels, max: 3000, min: -3000, step: 1 },
  y: { default: 0, format: formatPixels, max: 3000, min: -3000, step: 1 },
}

export function useSpineViewControl() {
  function reset(key: SupportedControl) {
    switch (key) {
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
    scale,
    viewControlMode,
    viewControlsEnabled,
  }
}
