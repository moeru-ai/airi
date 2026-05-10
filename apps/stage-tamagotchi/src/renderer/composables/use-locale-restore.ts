import type { Ref } from 'vue'

import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Restores the renderer locale from the main-process config when the
 * renderer's localStorage has lost the user's language setting.
 *
 * Use when:
 * - Electron restarts and renderer localStorage may not have been flushed
 *
 * Expects:
 * - `language` is the reactive language ref from the settings store
 * - `getMainLocale` returns the locale persisted in main-process config
 * - `setLocale` syncs the renderer locale back to main process
 *
 * Returns:
 * - `restore()` to be called during component onMounted
 */
export function useLocaleRestore(
  language: Ref<string>,
  getMainLocale: () => Promise<unknown>,
  setLocale: (locale: string) => Promise<unknown> | unknown,
) {
  const i18n = useI18n()
  let isLocaleSynced = false

  // Guard: do not propagate the store's navigator.language fallback back
  // to main-process config before we have verified the correct locale.
  watch(language, () => {
    i18n.locale.value = language.value || 'en'
    if (isLocaleSynced) {
      void setLocale(language.value || 'en')
    }
  })

  async function restore() {
    const mainLocale = await getMainLocale()
    if (typeof mainLocale === 'string' && mainLocale && mainLocale !== language.value) {
      language.value = mainLocale
    }
    isLocaleSynced = true
    void setLocale(language.value || 'en')
  }

  return { restore }
}
