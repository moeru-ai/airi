import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, default: number, buttonText: string }

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
  // TODO: allow user to set preferred default
  x: {
    min: -500,
    max: 500,
    step: 0.1,
    default: 0,
    buttonText: 'X',
  },
  y: {
    min: -500,
    max: 500,
    step: 0.1,
    default: 0,
    buttonText: 'Y',
  },
  scale: {
    min: 0.01,
    max: 3,
    step: 0.01,
    default: 1,
    buttonText: 'Scale',
  },
}

export const formatter: Record<SupportedControl, (val: number) => string> = {
  x: formatPercentD1,
  y: formatPercentD1,
  scale: formatToPercent,
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
      case 'x':
        position.value.x = clamped ?? defaultControlConfig.x.default
        break
      case 'y':
        position.value.y = clamped ?? defaultControlConfig.y.default
        break
      case 'scale':
        scale.value = clamped ?? defaultControlConfig.scale.default
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
    /** show or hide the control element(slider) on stage */
    viewControlsEnabled,
    /** what value to control for the control element */
    viewControlMode,
  }
}
