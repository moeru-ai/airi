import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'
import type { ProvidedBy } from 'injeca'

import type { MicToggleHotkey } from '../../../../shared/eventa'
import type { globalAppConfigSchema } from '../../../configs/global'
import type { Config } from '../../../libs/electron/persistence'

import { defineInvokeHandler } from '@moeru/eventa'
import { injeca } from 'injeca'

import { electronGetMicToggleHotkey, electronSetMicToggleHotkey } from '../../../../shared/eventa'
import { setupMicToggleShortcut } from '../../shortcuts/mic-toggle'

export async function createMicToggleService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { config } = await injeca.resolve({ config: 'configs:app' } as { config: ProvidedBy<Config<typeof globalAppConfigSchema>> })

  const initialHotkey = (config.get()?.microphoneToggleHotkey as MicToggleHotkey) || 'Scroll'
  setupMicToggleShortcut(params.window, initialHotkey)

  defineInvokeHandler(params.context, electronSetMicToggleHotkey, (payload) => {
    // Robust handling: sometimes eventa might pass an array if defined as a tuple, or just the value
    const hotkey = (Array.isArray(payload) ? payload[0] : payload) as MicToggleHotkey
    if (!hotkey) {
      console.warn(`[Mic Toggle Service] Received invalid hotkey update:`, payload)
      return
    }

    console.log(`[Mic Toggle Service] Setting hotkey ->`, hotkey, `(payload:`, payload, `)`)
    const currentConfig = config.get() || { language: 'en', windows: [], microphoneToggleHotkey: 'Scroll' as const }
    config.update({ ...currentConfig, microphoneToggleHotkey: hotkey })

    // Immediate log to check what we JUST updated
    console.log(`[Mic Toggle Service] Config check after update ->`, config.get()?.microphoneToggleHotkey)
    setupMicToggleShortcut(params.window, hotkey)
  })

  defineInvokeHandler(params.context, electronGetMicToggleHotkey, () => {
    const hotkey = config.get()?.microphoneToggleHotkey
    console.log(`[Mic Toggle Service] Getting hotkey ->`, hotkey, `(normalized:`, (Array.isArray(hotkey) ? hotkey[0] : (hotkey as MicToggleHotkey)) || 'Scroll', `)`)
    // Normalizing: ensure we always return a string, even if an array was somehow stored
    return (Array.isArray(hotkey) ? hotkey[0] : (hotkey as MicToggleHotkey)) || 'Scroll'
  })
}
