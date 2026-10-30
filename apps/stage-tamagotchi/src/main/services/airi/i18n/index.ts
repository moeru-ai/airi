import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'
import type { ProvidedBy } from 'injeca'

import type { globalAppConfigSchema } from '../../../configs/global'
import type { Config } from '../../../libs/electron/persistence'
import type { I18n } from '../../../libs/i18n'

import { defineInvokeHandler } from '@moeru/eventa'
import { waitWithSignal } from '@proj-airi/stage-shared'
import { injeca } from 'injeca'

import { i18nGetLocale, i18nSetLocale } from '../../../../shared/eventa'

export async function createI18nService(params: {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
  i18n: I18n
  signal?: AbortSignal
}) {
  if (params.signal?.aborted || params.window.isDestroyed?.()) {
    throw new Error('Window was closed before i18n service setup')
  }

  const { config } = await waitWithSignal(
    injeca.resolve({ config: 'configs:app' } as { config: ProvidedBy<Config<typeof globalAppConfigSchema>> }),
    params.signal,
  )

  if (params.signal?.aborted || params.window.isDestroyed?.()) {
    throw new Error('Window was closed during i18n service setup')
  }

  params.i18n.locale(config.get()?.language || 'en')

  defineInvokeHandler(params.context, i18nSetLocale, (locale) => {
    const current = config.get()
    config.update({ ...current, language: locale as string })
    params.i18n.locale(locale)
  })

  defineInvokeHandler(params.context, i18nGetLocale, () => {
    return config.get()?.language
  })
}
