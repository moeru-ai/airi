import type { HomeAssistantExposure, HomeAssistantExposureMode } from '../../libs/home-assistant/exposure'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { isExposureMode } from '../../libs/home-assistant/exposure'

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
 *
 * {@link exposure} is the third part: which devices the model can reach. It
 * belongs to the renderer for the same reason `enabled` does, because the user
 * owns the choice and the tools that apply it live in the renderer.
 *
 * The two lists are separate on purpose. One shared list would turn every
 * allowed device into a blocked device the moment the user switched modes.
 */
export const useHomeAssistantStore = defineStore('home-assistant', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/home-assistant/enabled', false)
  const hasCredentials = useLocalStorageManualReset<boolean>('settings/home-assistant/has-credentials', false)
  const storedExposureMode = useLocalStorageManualReset<string>('settings/home-assistant/exposure-mode', 'all')
  const allowedEntities = useLocalStorageManualReset<string[]>('settings/home-assistant/allowed-entities', [])
  const deniedEntities = useLocalStorageManualReset<string[]>('settings/home-assistant/denied-entities', [])

  const configured = computed(() => enabled.value && hasCredentials.value)

  /**
   * The access mode the settings page edits.
   *
   * The stored value is checked on every read, so the page and the policy can
   * never disagree about which rule is in force.
   */
  const exposureMode = computed<HomeAssistantExposureMode>({
    get: () => isExposureMode(storedExposureMode.value) ? storedExposureMode.value : 'all',
    set: value => storedExposureMode.value = value,
  })

  /** The policy the tools apply. */
  const exposure = computed<HomeAssistantExposure>(() => {
    if (exposureMode.value === 'allow')
      return { mode: 'allow', entityIds: allowedEntities.value }
    if (exposureMode.value === 'deny')
      return { mode: 'deny', entityIds: deniedEntities.value }
    return { mode: 'all' }
  })

  /** The ids of the list the active mode edits. Empty under `all`, which edits no list. */
  const selectedEntityIds = computed<string[]>(() => {
    if (exposureMode.value === 'allow')
      return allowedEntities.value
    if (exposureMode.value === 'deny')
      return deniedEntities.value
    return []
  })

  /** Records what the main process holds. The settings page owns this call. */
  function setHasCredentials(value: boolean) {
    hasCredentials.value = value
  }

  /**
   * Adds or removes devices on the list the active mode edits.
   *
   * Under `all` there is no list to edit, so the call does nothing.
   */
  function setEntitiesSelected(entityIds: string[], selected: boolean) {
    const target = exposureMode.value === 'allow'
      ? allowedEntities
      : exposureMode.value === 'deny' ? deniedEntities : undefined
    if (!target)
      return

    const next = new Set(target.value)
    for (const entityId of entityIds) {
      if (selected)
        next.add(entityId)
      else
        next.delete(entityId)
    }

    target.value = [...next].sort()
  }

  /** Adds or removes one device on the list the active mode edits. */
  function setEntitySelected(entityId: string, selected: boolean) {
    setEntitiesSelected([entityId], selected)
  }

  /**
   * Empties both lists.
   *
   * The settings page calls this when the address changes. An id means one
   * device on one instance, so a list written for the old instance would allow
   * or block a different device on the new one.
   */
  function clearSelection() {
    allowedEntities.value = []
    deniedEntities.value = []
  }

  function resetState() {
    enabled.reset()
    hasCredentials.reset()
    storedExposureMode.reset()
    allowedEntities.reset()
    deniedEntities.reset()
  }

  return {
    enabled,
    hasCredentials,
    exposureMode,
    allowedEntities,
    deniedEntities,
    configured,
    exposure,
    selectedEntityIds,

    setHasCredentials,
    clearSelection,
    setEntitySelected,
    setEntitiesSelected,
    resetState,
  }
})
