import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { boolean, parse, record, string } from 'valibot'

/**
 * The kinds of data that sync to the signed-in account. Each kind has its own switch.
 *
 * - `chats`: the text of chat messages and the chat titles.
 * - `providers`: the provider configurations, with their API keys.
 * - `character-cards`: the character cards.
 * - `display-models`: the imported Live2D and VRM model files.
 */
export const syncCategories = ['chats', 'providers', 'character-cards', 'display-models'] as const

export type SyncCategory = typeof syncCategories[number]

const preferencesSchema = record(string(), boolean())
const preferencesSerializer = {
  read: (value: string) => parse(preferencesSchema, JSON.parse(value)),
  write: (value: Record<string, boolean>) => JSON.stringify(value),
}

// NOTICE:
// Card sync and model sync were experiments, so their choices are in the feature flag preferences.
// The first sync preferences copy them, so a device that turned a sync off keeps it off.
// Key format: `preferenceKey` in `stores/feature-flags.ts`.
// Removal condition: two stable releases after this store ships.
const experimentKeys: Readonly<Record<string, SyncCategory>> = {
  'character-card-sync': 'character-cards',
  'display-model-sync': 'display-models',
}

function experimentChoicesOf(flagPreferences: Record<string, boolean>): Partial<Record<SyncCategory, boolean>> {
  const choices: Partial<Record<SyncCategory, boolean>> = {}
  for (const [flagKey, category] of Object.entries(experimentKeys)) {
    const choice = flagPreferences[JSON.stringify([flagKey, null])]
    if (choice !== undefined)
      choices[category] = choice
  }
  return choices
}

/**
 * The sync switches of this device. Each sync is on by default. A sync runs only while an account is signed in.
 *
 * The choices stay on the device and do not follow the account. Each window reads them from local storage.
 * A change in one window reaches the other windows through the storage event.
 */
export const useSyncPreferencesStore = defineStore('sync-preferences', () => {
  // Read once, only for the first value below. It never writes the feature flag preferences.
  // An unreadable value gives the default, so each sync takes its default.
  const flagPreferences = useLocalStorage<Record<string, boolean>>('settings/feature-flags', {}, {
    serializer: preferencesSerializer,
    writeDefaults: false,
    listenToStorageChanges: false,
    onError: () => {},
  })

  /**
   * Only a switch that the user changed has an entry.
   * The first value applies only while the device has no saved preferences, and storage keeps it from then on.
   */
  const preferences = useLocalStorage<Record<string, boolean>>('settings/sync', experimentChoicesOf(flagPreferences.value), {
    serializer: preferencesSerializer,
  })

  function isEnabled(category: SyncCategory): boolean {
    return preferences.value[category] ?? true
  }

  function setEnabled(category: SyncCategory, enabled: boolean) {
    if (preferences.value[category] === enabled)
      return
    preferences.value = { ...preferences.value, [category]: enabled }
  }

  return {
    isEnabled,
    setEnabled,
  }
})
