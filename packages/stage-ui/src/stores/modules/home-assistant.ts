import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/**
 * Settings and lifecycle for the Home Assistant integration.
 *
 * The switch and the credential live in different places on purpose. `enabled`
 * belongs to the user and stays in the renderer, like every other module. The
 * address and the token belong to the Electron main process, which performs the
 * requests, so this store holds only {@link hasCredentials}: a flag the settings
 * page writes after it reads the main process.
 *
 * Mirroring the flag keeps the module card honest without an IPC call, and it
 * gives Stage Web a value to read at all. Stage Web never writes it, so the
 * integration stays off there.
 */
export const useHomeAssistantStore = defineStore('home-assistant', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/home-assistant/enabled', false)
  const hasCredentials = useLocalStorageManualReset<boolean>('settings/home-assistant/has-credentials', false)

  const configured = computed(() => enabled.value && hasCredentials.value)

  /** Records what the main process holds. The settings page owns this call. */
  function setHasCredentials(value: boolean) {
    hasCredentials.value = value
  }

  function resetState() {
    enabled.reset()
    hasCredentials.reset()
  }

  return {
    enabled,
    hasCredentials,
    configured,

    setHasCredentials,
    resetState,
  }
})
