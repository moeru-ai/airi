import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale'] as const
type SupportedControl = typeof supportedControl[number]
interface ControlConfig { min: number, max: number, step: number, format: (val: number) => string }

/** show or hide the control element(slider) on stage */
const viewControlsEnabled = ref(false)
/** what value to control for the control element */
const viewControlMode = ref<SupportedControl>('scale')
/** model position relative to the center of the screen, in pixels */
const position = useLocalStorageManualReset<{ x: number, y: number }>('settings/live2d/position', { x: 0, y: 0 })
/** model scaling. `1` means no scaling. */
const scale = useLocalStorageManualReset('settings/live2d/scale', 1)

const formatDecimalPx = (val: number) => `${val.toFixed(0)}px`
const formatPercent = (val: number) => `${(val * 100).toFixed(0)}%`

export const controlConfig: Record<SupportedControl, ControlConfig> = {
  // TODO: calculate the min and max value dynamically according to window height/width, or allow user to set it
  x: {
    min: -1000,
    max: 1000,
    step: 1,
    format: formatDecimalPx,
  },
  y: {
    min: -1000,
    max: 1000,
    step: 1,
    format: formatDecimalPx,
  },
  scale: {
    min: 0.01,
    max: 3,
    step: 0.01,
    format: formatPercent,
  },
}

export function useL2dViewControl() {
  /**
   * reset the given control to its default value.
   *  @param key the control to reset
   */
  function reset(key: SupportedControl) {
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
    /** model position relative to the center of the screen, in pixels */
    position,
    /** model scaling in percentages. `100` means no scaling. */
    scale,
    /** reset the given control to its default value. */
    reset,
    /** show or hide the control element(slider) on stage */
    viewControlsEnabled,
    /** what value to control for the control element */
    viewControlMode,
  }
}
