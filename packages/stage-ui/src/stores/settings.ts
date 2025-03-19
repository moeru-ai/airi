import { useDevicesList, useLocalStorage } from '@vueuse/core'
import { converter } from 'culori'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const DEFAULT_THEME_COLORS_HUE = 178.17

const convert = converter('oklch')
const getHueFrom = (color?: string) => color ? convert(color)?.h : DEFAULT_THEME_COLORS_HUE

export const useSettings = defineStore('settings', () => {
  const selectedAudioDevice = ref<MediaDeviceInfo>()

  const language = useLocalStorage('settings/language', 'en-US')
  const stageView = useLocalStorage('settings/stage/view/model-renderer', '2d')

  const isAudioInputOn = useLocalStorage('settings/audio/input', 'true')
  const selectedAudioDeviceId = computed(() => selectedAudioDevice.value?.deviceId)
  const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })

  // TODO: extract to a separate store, use a single page to do this
  const live2dModelFile = ref<File>()
  const live2dModelUrl = ref<string>('/assets/live2d/models/hiyori_pro_zh.zip')
  const live2dLoadSource = ref<'file' | 'url'>('url')
  const loadingLive2dModel = ref(false) // if set to true, the model will be loaded
  const live2dPosition = useLocalStorage('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen
  const live2dCurrentMotion = ref<{ group: string, index?: number }>({ group: 'Idle', index: 0 })
  const availableLive2dMotions = ref<{ motionName: string, motionIndex: number, fileName: string }[]>([])
  const live2dMotionMap = useLocalStorage<Record<string, string>>('settings/live2d/motion-map', {})

  const disableTransitions = useLocalStorage('settings/disable-transitions', true)

  const themeColorsHue = useLocalStorage('settings/theme/colors/hue', DEFAULT_THEME_COLORS_HUE)
  const themeColorsHueDynamic = useLocalStorage('settings/theme/colors/hue-dynamic', false)

  function setThemeColorsHue(hue = DEFAULT_THEME_COLORS_HUE) {
    themeColorsHue.value = hue
    themeColorsHueDynamic.value = false
  }

  function applyPrimaryColorFrom(color?: string) {
    setThemeColorsHue(getHueFrom(color))
  }

  /**
   * Check if a color is currently selected based on its hue value
   * @param hexColor Hex color code to check
   * @returns True if the color's hue matches the current theme hue
   */
  function isColorSelectedForPrimary(hexColor?: string) {
    // If dynamic coloring is enabled, no preset color is manually selected
    if (themeColorsHueDynamic.value)
      return false

    // Convert hex color to OKLCH
    const h = getHueFrom(hexColor)
    if (!h)
      return false

    // Compare hue values with a small tolerance for floating point comparison
    const hueDifference = Math.abs(h - themeColorsHue.value)
    return hueDifference < 0.01 || hueDifference > 359.99
  }

  watch(isAudioInputOn, (value) => {
    if (value === 'false') {
      selectedAudioDevice.value = undefined
    }
    if (value === 'true') {
      selectedAudioDevice.value = audioInputs.value[0]
    }
  })

  watch(audioInputs, () => {
    if (isAudioInputOn.value === 'true' && !selectedAudioDevice.value) {
      selectedAudioDevice.value = audioInputs.value[0]
    }
  }, { immediate: true })

  return {
    live2dModelFile,
    live2dModelUrl,
    live2dLoadSource,
    live2dCurrentMotion,
    live2dPosition,
    availableLive2dMotions,
    live2dMotionMap,
    loadingLive2dModel,
    disableTransitions,
    language,
    stageView,
    themeColorsHue,
    themeColorsHueDynamic,
    isAudioInputOn,
    selectedAudioDevice,
    selectedAudioDeviceId,

    setThemeColorsHue,
    applyPrimaryColorFrom,
    isColorSelectedForPrimary,
  }
})
