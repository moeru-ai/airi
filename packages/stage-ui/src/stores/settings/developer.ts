import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsDeveloper = defineStore('settings-developer', () => {
  const inspectUpdaterDiagnostics = useLocalStorageManualReset<boolean>('settings/developer/inspect-updater-diagnostics', false)
  // Chat tool calls show their arguments and results as a JSON tree, not as the formatted fields, and cards in replies
  // offer their program. Owners without it see only the cards.
  const showToolPayloadsAsJson = useLocalStorageManualReset<boolean>('settings/developer/show-tool-payloads-as-json', false)

  function resetState() {
    inspectUpdaterDiagnostics.reset()
    showToolPayloadsAsJson.reset()
  }

  return {
    inspectUpdaterDiagnostics,
    showToolPayloadsAsJson,
    resetState,
  }
})
