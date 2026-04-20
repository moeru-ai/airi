import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { computed, ref } from 'vue'

export const supportedControl = ['x', 'y', 'scale'] as const
type SupportedControl = typeof supportedControl[number]

const viewControlsEnabled = ref(false)
const viewControlMode = ref<SupportedControl>('scale')

export function useL2dViewControl() {
  const position = useLocalStorageManualReset<{ x: number, y: number }>('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen, units are %
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
  }))

  const scale = useLocalStorageManualReset('settings/live2d/scale', 1)

  const reset = (key: SupportedControl) => {
    switch (key) {
      case 'x':
        position.value.x = 0
        break
      case 'y':
        position.value.y = 0
        break
      case 'scale':
        scale.value = 1
        break
    }
  }

  return {
    position,
    positionInPercentageString,
    scale,
    reset,
    viewControlsEnabled,
    viewControlMode,
  }
}
