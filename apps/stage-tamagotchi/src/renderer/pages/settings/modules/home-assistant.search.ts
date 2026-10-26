import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'

import { homeAssistantGetConfig } from '../../../../shared/eventa/home-assistant'
import { useTamagotchiHomeAssistantStore } from '../../../stores/tools/home-assistant'

const ENTITY_KIND = 'home-assistant-entity'

/** The marker of a device's tile. The page and the provider share it. */
export function homeAssistantEntitySearchKey(entityId: string) {
  return settingsSearchItemKey(ENTITY_KIND, entityId)
}

/** The device that a search result names, or `undefined` for any other setting. */
export function homeAssistantEntityOfSearchKey(key: unknown) {
  const prefix = `${ENTITY_KIND}:`
  return typeof key === 'string' && key.startsWith(prefix) ? decodeURIComponent(key.slice(prefix.length)) : undefined
}

/**
 * Lists the devices of the instance by name.
 * The page reads the device list only while it shows the device grid, so the provider reads it under the same condition.
 */
const provideEntities: SettingsSearchProvider = async () => {
  const config = await useElectronEventaInvoke(homeAssistantGetConfig)()
  if (useHomeAssistantStore().exposureMode === 'all' || !config.baseUrl || !config.hasToken)
    return []
  const entities = await useTamagotchiHomeAssistantStore().listEntities()
  return entities.map(entity => ({ title: entity.name, key: homeAssistantEntitySearchKey(entity.entityId) }))
}

export default provideEntities
