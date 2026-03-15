import type { ExtensionSettings } from '../shared/types'

import { DEFAULT_SETTINGS, STORAGE_KEY } from '../shared/constants'

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY)
  const value = stored[STORAGE_KEY] as ExtensionSettings | undefined
  return {
    ...DEFAULT_SETTINGS,
    ...value,
  }
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = {
    ...DEFAULT_SETTINGS,
    ...(await loadSettings()),
    ...partial,
  }

  await browser.storage.local.set({ [STORAGE_KEY]: next })
  return next
}
