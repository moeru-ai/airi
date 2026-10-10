import { computed, watch } from 'vue'

import { useSettings } from '../../../stores/settings'
import { useVrmMotionsStore } from './store'

/** The prompt lists only enabled motions for the selected VRM avatar. No animation files enter the model context. */
export function useVrmMotionPrompt() {
  const settings = useSettings()
  const motions = useVrmMotionsStore()
  watch(() => settings.stageModelSelected, (id) => {
    void motions.loadPreferences(id).catch(console.error)
  }, { immediate: true })
  return computed(() => settings.stageModelRenderer === 'vrm' ? motions.prompt(settings.stageModelSelected) : '')
}
