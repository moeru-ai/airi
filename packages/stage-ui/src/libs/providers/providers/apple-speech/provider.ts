import type { AppleSpeechLocale } from '@xsai-apple-speech/transcription'

import type { ProviderConfigContext } from '../../types'

import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-electron-plugin'
import { z } from 'zod'

export const appleSpeechConfigSchema = z.object({
  locale: z.string().trim().min(1).default('en-US'),
})

/** Serializable configuration for the Apple Speech Provider. */
export type AppleSpeechConfig = z.input<typeof appleSpeechConfigSchema>

function localeLabel(locale: string) {
  try {
    const displayName = new Intl.DisplayNames([locale], { type: 'language' }).of(locale)
    if (displayName && displayName !== locale)
      return `${displayName} (${locale})`
  }
  catch {
    // Apple owns this locale inventory. Keep its canonical identifier visible
    // if the current JavaScript runtime cannot format a newer language tag.
  }
  return locale
}

function sortLocales(locales: AppleSpeechLocale[]) {
  return [...locales].sort((left, right) => {
    if (left.installed !== right.installed)
      return left.installed ? -1 : 1
    return left.locale.localeCompare(right.locale)
  })
}

/** Lists labeled native locales available through Apple's automatic transcriber selection. */
export async function listAppleSpeechLocaleOptions(context: ProviderConfigContext<AppleSpeechConfig>) {
  if (context.config === undefined)
    return []
  if (typeof window === 'undefined' || !isElectronWindow(window) || window.platform !== 'darwin')
    return []

  context.abortSignal?.throwIfAborted()
  const eventa = createContext(window.electron.ipcRenderer)
  try {
    const provider = createAppleSpeechProvider({ context: eventa.context })
    const locales = await provider.getLocales({ transcriber: 'automatic' })
    context.abortSignal?.throwIfAborted()
    return sortLocales(locales).map(({ locale }) => ({
      label: localeLabel(locale),
      value: locale,
    }))
  }
  finally {
    eventa.dispose()
  }
}
