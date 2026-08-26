import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale'] as const
interface ControlConfig { buttonText: string, default: number, max: number, min: number, step: number }
type SupportedControl = typeof supportedControl[number]

/** show or hide the control element(slider) on stage */
const viewControlsEnabled = ref(false)
/** what value to control for the control element */
const viewControlMode = ref<SupportedControl>('scale')
/** model position relative to the center of the screen, in percentages */
const position = useLocalStorage<{ x: number, y: number }>('settings/live2d/position', { x: 0, y: 0 })
/** model scaling factor. `1` means no scaling. */
const scale = useLocalStorage('settings/live2d/scale', 1)

const formatPercentD1 = (val: number) => `${val.toFixed(1)}%`
const formatToPercent = (val: number) => `${(val * 100).toFixed(0)}%`

export const defaultControlConfig: Record<SupportedControl, ControlConfig> = {
  scale: {
    buttonText: 'Scale',
    default: 1,
    max: 3,
    min: 0.01,
    step: 0.01,
  },
  // TODO: allow user to set preferred default
  x: {
    buttonText: 'X',
    default: 0,
    max: 500,
    min: -500,
    step: 0.1,
  },
  y: {
    buttonText: 'Y',
    default: 0,
    max: 500,
    min: -500,
    step: 0.1,
  },
}

export const formatter: Record<SupportedControl, (val: number) => string> = {
  scale: formatToPercent,
  x: formatPercentD1,
  y: formatPercentD1,
}
const clampMinMax = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
export function useL2dViewControl() {
  /**
   * reset the given control to its default value.
   *  @param key the control to reset
   *  @param value optional, will reset the value to its default if not provided
   */
  function set(key: SupportedControl, value?: number) {
    const clamped = value !== undefined ? clampMinMax(value, defaultControlConfig[key].min, defaultControlConfig[key].max) : undefined
    switch (key) {
      case 'scale':
        scale.value = clamped ?? defaultControlConfig.scale.default
        break
      case 'x':
        position.value.x = clamped ?? defaultControlConfig.x.default
        break
      case 'y':
        position.value.y = clamped ?? defaultControlConfig.y.default
        break
    }
  }

  return {
    /** model position relative to the center of the screen, in pixels */
    position,
    /** model scaling in percentages. `1` means no scaling. */
    scale,
    /** reset the given control to its default value. */
    set,
    /** what value to control for the control element */
    viewControlMode,
    /** show or hide the control element(slider) on stage */
    viewControlsEnabled,
  }
}
