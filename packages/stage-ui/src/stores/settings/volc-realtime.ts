import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsVolcRealtime = defineStore('settings-volc-realtime', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/volc-realtime/enabled', false)
  const serverUrl = useLocalStorageManualReset<string>('settings/volc-realtime/server-url', 'ws://localhost:8765')
  const autoConnect = useLocalStorageManualReset<boolean>('settings/volc-realtime/auto-connect', false)

  // Volcengine API credentials
  const volcAppId = useLocalStorageManualReset<string>('settings/volc-realtime/volc-app-id', '')
  const volcAccessKey = useLocalStorageManualReset<string>('settings/volc-realtime/volc-access-key', '')
  const volcAppKey = useLocalStorageManualReset<string>('settings/volc-realtime/volc-app-key', '')
  const volcResourceId = useLocalStorageManualReset<string>('settings/volc-realtime/volc-resource-id', 'volc.speech.dialog')
  const volcSpeaker = useLocalStorageManualReset<string>('settings/volc-realtime/volc-speaker', 'zh_female_vv_jupiter_bigtts')
  const volcDialogModel = useLocalStorageManualReset<string>('settings/volc-realtime/volc-dialog-model', '1.2.1.1')

  function resetState() {
    enabled.value = false
    serverUrl.value = 'ws://localhost:8765'
    autoConnect.value = false
    volcAppId.value = ''
    volcAccessKey.value = ''
    volcAppKey.value = ''
    volcResourceId.value = 'volc.speech.dialog'
    volcSpeaker.value = 'zh_female_vv_jupiter_bigtts'
    volcDialogModel.value = '1.2.1.1'
  }

  return {
    enabled,
    serverUrl,
    autoConnect,
    volcAppId,
    volcAccessKey,
    volcAppKey,
    volcResourceId,
    volcSpeaker,
    volcDialogModel,
    resetState,
  }
})
