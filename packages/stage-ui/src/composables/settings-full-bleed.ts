import type { InjectionKey, MaybeRefOrGetter } from 'vue'

import { inject, toValue, watch } from 'vue'

/**
 * A settings layout that can let one page fill the whole content area, under its page header.
 *
 * The layout provides it. Without a provider, {@link useSettingsFullBleed} does nothing.
 */
export interface SettingsFullBleedHost {
  /** Lets the page fill the area under the header. The returned function gives the area back. */
  claim: () => () => void
}

export const settingsFullBleedHostKey: InjectionKey<SettingsFullBleedHost> = Symbol('@proj-airi/stage-ui/settings-full-bleed-host')

/**
 * Declares that a settings page fills the content area to the screen edges, and that the page header floats over it.
 *
 * Use when:
 * - A page shows a full-screen stage, for example the phone model editor.
 *
 * Expects:
 * - The page keeps the top of its area clear enough for the header title and the back button.
 * - `enabled` turns the declaration off and on while the page stays mounted.
 */
export function useSettingsFullBleed(enabled: MaybeRefOrGetter<boolean> = true) {
  const host = inject(settingsFullBleedHostKey, undefined)
  if (!host)
    return

  watch(() => toValue(enabled), (active, _, onCleanup) => {
    if (active)
      onCleanup(host.claim())
  }, { immediate: true })
}
