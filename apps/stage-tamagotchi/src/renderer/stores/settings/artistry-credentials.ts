import type { ArtistrySyncPayload } from '@proj-airi/stage-shared'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { artistryGetConfig, artistrySetApiKeys, artistrySyncConfig } from '@proj-airi/stage-shared'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useLocalStorage } from '@vueuse/core'
import { isEqual } from 'es-toolkit'
import { defineStore, storeToRefs } from 'pinia'
import { shallowRef, watch } from 'vue'
import { toast } from 'vue-sonner'

// Pre-upgrade installs wrote these two keys straight to localStorage (see
// packages/stage-ui/src/stores/modules/artistry.ts history). Tamagotchi now persists the
// same credentials through the Electron main process's encrypted safeStorage instead, so any
// value still sitting under these keys is a leftover plaintext copy that must be migrated into
// the encrypted store and then cleared.
const LEGACY_REPLICATE_API_KEY_STORAGE_KEY = 'artistry-replicate-api-key'
const LEGACY_NANOBANANA_API_KEY_STORAGE_KEY = 'artistry-nanobanana-api-key'

export const useArtistryCredentialsStore = defineStore('tamagotchi-artistry-credentials', () => {
  const artistryStore = useArtistryStore()
  const { activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions, replicateApiKey, nanobananaApiKey } = storeToRefs(artistryStore)

  const legacyReplicateApiKey = useLocalStorage<string>(LEGACY_REPLICATE_API_KEY_STORAGE_KEY, '')
  const legacyNanobananaApiKey = useLocalStorage<string>(LEGACY_NANOBANANA_API_KEY_STORAGE_KEY, '')

  const getArtistryConfig = useElectronEventaInvoke(artistryGetConfig)
  const syncArtistryConfig = useElectronEventaInvoke(artistrySyncConfig)
  const setArtistryApiKeys = useElectronEventaInvoke(artistrySetApiKeys)

  // Gates pushArtistryConfig below. Only flips to true once hydration has confirmed the
  // real stored (or freshly migrated) keys — see pushArtistryConfig's guard for why.
  const credentialsHydrated = shallowRef(false)
  let lastSyncedArtistryConfig: ArtistrySyncPayload | undefined

  async function hydrateAndMigrateCredentials() {
    try {
      const config = await getArtistryConfig()
      if (config?.replicateApiKeyUnavailable || config?.nanobananaApiKeyUnavailable) {
        // NOTICE: the keychain was unavailable while main tried to decrypt a non-empty
        // stored key. Treat this exactly like a failed hydration (falls into the catch
        // below) rather than accepting the empty-string placeholder as real -- otherwise
        // the push watcher's first run would re-sync that empty value and permanently
        // erase the ciphertext. (review: PR #2512 discussion r4179494678)
        throw new Error('Secure storage is currently unavailable; cannot safely hydrate Artistry API keys')
      }

      const mainGlobals = config?.globals ?? {}
      const mainReplicateKey = mainGlobals.replicateApiKey ?? ''
      const mainNanobananaKey = mainGlobals.nanobananaApiKey ?? ''

      // Main is authoritative once it has ever stored a key. Only fall back to a
      // pre-upgrade plaintext value still in localStorage when main has never seen this
      // credential at all. (review: https://github.com/moeru-ai/airi/pull/2512#discussion_r4176290522)
      const replicateKey = mainReplicateKey || legacyReplicateApiKey.value
      const nanobananaKey = mainNanobananaKey || legacyNanobananaApiKey.value
      const needsMigration = (!mainReplicateKey && !!legacyReplicateApiKey.value)
        || (!mainNanobananaKey && !!legacyNanobananaApiKey.value)

      if (needsMigration) {
        // setArtistryApiKeys() throws (via artistryConfig.update()'s existing fail-closed
        // check) if main cannot persist it. Reaching past this line means the migrated value
        // is confirmed encrypted on disk, so only then is it safe to drop the plaintext
        // legacy copy below.
        await setArtistryApiKeys({ replicateApiKey: replicateKey, nanobananaApiKey: nanobananaKey })
      }

      legacyReplicateApiKey.value = ''
      legacyNanobananaApiKey.value = ''
      replicateApiKey.value = replicateKey
      nanobananaApiKey.value = nanobananaKey
      credentialsHydrated.value = true
    }
    catch (error) {
      console.warn('[artistry-credentials] Failed to hydrate/migrate API keys securely:', errorMessageFrom(error))
      toast.error(errorMessageFrom(error) ?? 'Could not load saved Artistry API keys securely')
    }
  }

  function pushArtistryConfig() {
    // NOTICE: never push before hydration above confirms we hold the real stored/migrated
    // keys — pushing earlier would overwrite the encrypted keys already on disk with the
    // refs' empty startup defaults. A failed hydration leaves this false for the rest of the
    // session (no retry): IPC to one's own main process essentially never fails transiently,
    // so a failure here means something is actually broken, and disabling sync is the safe
    // default. (review: https://github.com/moeru-ai/airi/pull/2512#discussion_r4176290523)
    if (!credentialsHydrated.value || !activeProvider.value)
      return

    const config = JSON.parse(JSON.stringify({
      provider: activeProvider.value,
      globals: artistryGlobals.value,
      model: activeModel.value,
      promptPrefix: defaultPromptPrefix.value,
      options: providerOptions.value,
    })) as ArtistrySyncPayload
    if (isEqual(config, lastSyncedArtistryConfig))
      return

    // Pinia synchronization applies cloned snapshots in every renderer. Keep this IPC bridge
    // edge-triggered so equal snapshots do not repeat IO.
    lastSyncedArtistryConfig = config
    void syncArtistryConfig(config).catch((error) => {
      toast.error(errorMessageFrom(error) ?? 'Failed to save artistry settings securely')
    })
  }

  void hydrateAndMigrateCredentials().finally(() => {
    watch([activeProvider, artistryGlobals, activeModel, defaultPromptPrefix, providerOptions], pushArtistryConfig, { deep: true, immediate: true })
  })

  return {
    credentialsHydrated,
  }
})
