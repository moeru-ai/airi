import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { InferOutput } from 'valibot'

import type { ChatDraftHandover, ChatWindowPreferences } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext as createElectronContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow, ipcMain } from 'electron'
import { boolean, number, object, optional, picklist } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { electronChatWindowGetPreferences, electronChatWindowSetPreferences, electronChatWindowTakeDraft } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation, toggleWindowShow } from '../shared'
import { setupFloatingChatWindow } from './floating'
import { createChatModeSwitch } from './mode-switch'
import { setupChatWindowElectronInvokes } from './rpc/index.electron'

type EventaContext = ReturnType<typeof createContext>['context']

const chatWindowConfigSchema = object({
  mode: picklist(['legacy', 'floating']),
  placement: picklist(['attached', 'free']),
  // A choice the user has not made yet keeps the chat on top, as before.
  pinned: optional(boolean(), true),
  floating: object({
    width: number(),
    height: number(),
    x: optional(number()),
    y: optional(number()),
  }),
})

type ChatWindowConfig = InferOutput<typeof chatWindowConfigSchema>

/**
 * The legacy window stays the default until the floating mode has user
 * feedback. The floating size fits the composer and a few bubbles beside the
 * default 450x600 main window.
 */
const defaultChatWindowConfig: ChatWindowConfig = {
  mode: 'legacy',
  placement: 'attached',
  pinned: true,
  floating: { width: 380, height: 560 },
}

/** Opens the chat in the mode the user chose. */
export interface ChatWindowManager {
  /** Shows the chat and brings it to the front. Spotlight notifications call this. */
  open: () => Promise<void>
  /**
   * Runs the Controls Island chat button. The legacy window shows and focuses;
   * the floating chat folds when it is shown and unfolds otherwise.
   */
  toggle: () => Promise<void>
}

/**
 * Owns both chat windows and the persisted choice between them.
 *
 * Both modes load the same chat components and register the same services,
 * so a mode changes only the window around the chat. Transparency is fixed
 * when Electron creates a window, so each mode has its own window, and a mode
 * switch closes one and opens the other.
 */
export function setupChatWindowManager(params: {
  getMainWindow: () => BrowserWindow | undefined
  widgetsManager: WidgetsWindowManager
  serverChannel: ServerChannel
  mcpStdioManager: McpStdioManager
  i18n: I18n
}): ChatWindowManager {
  const {
    setup: setupConfig,
    get: getConfigRaw,
    update: updateConfig,
  } = createConfig('chat-window', 'config.json', chatWindowConfigSchema, {
    default: defaultChatWindowConfig,
    autoHeal: true,
  })
  setupConfig()
  const getConfig = (): ChatWindowConfig => getConfigRaw() ?? defaultChatWindowConfig

  function getPreferences(): ChatWindowPreferences {
    const { mode, placement, pinned } = getConfig()
    return { mode, placement, pinned }
  }

  /**
   * Unsent composer content from the window that asked for a mode switch,
   * kept until the next chat window takes it. A window that fails to open
   * leaves it for the next chat window that does.
   */
  let pendingDraft: ChatDraftHandover | undefined

  async function setupChatInvokes(window: BrowserWindow, context: EventaContext) {
    await setupChatWindowElectronInvokes({
      context,
      window,
      widgetsManager: params.widgetsManager,
      serverChannel: params.serverChannel,
      mcpStdioManager: params.mcpStdioManager,
      i18n: params.i18n,
    })

    defineInvokeHandler(context, electronChatWindowGetPreferences, () => getPreferences())
    defineInvokeHandler(context, electronChatWindowSetPreferences, (payload) => {
      if (!payload)
        return

      // Not awaited: a mode switch closes the window that asked for it, which
      // must not wait on its own reply.
      void setPreferences(payload.preferences, payload.draft)
        .catch(error => console.error('[chat-window] Failed to apply preferences:', error))
    })
    defineInvokeHandler(context, electronChatWindowTakeDraft, () => {
      const draft = pendingDraft
      pendingDraft = undefined
      return draft
    })
  }

  let legacyWindow: BrowserWindow | undefined
  const legacy = createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Chat',
      width: 600.0,
      height: 800.0,
      show: false,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)
    // `onlySameWindow` hears only this window and disposes with it, so a mode
    // switch that closes the window leaves no handlers behind.
    const { context } = createElectronContext(ipcMain, window, { onlySameWindow: true })
    legacyWindow = window
    window.on('closed', () => {
      if (legacyWindow === window)
        legacyWindow = undefined
    })

    try {
      await setupChatInvokes(window, context)
      await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/chat', {
        query: {
          'stage-runtime': 'minimal',
          'synced-leader': 'false',
        },
      }))
    }
    catch (error) {
      window.destroy()
      throw error
    }

    return window
  })

  const floating = setupFloatingChatWindow({
    getMainWindow: params.getMainWindow,
    getPlacement: () => getConfig().placement,
    getPinned: () => getConfig().pinned,
    getBounds: () => getConfig().floating,
    saveBounds: bounds => updateConfig({ ...getConfig(), floating: bounds }),
    setupChatInvokes,
  })

  async function openLegacy() {
    const window = await legacy.getWindow()
    if (window.isMinimized())
      window.restore()
    window.show()
    window.focus()
    window.moveTop()
  }

  const modeSwitch = createChatModeSwitch({
    getMode: () => getConfig().mode,
    legacy: { open: openLegacy, close: () => legacyWindow?.close() },
    floating: { open: floating.open, close: floating.close },
  })

  async function setPreferences(next: ChatWindowPreferences, draft?: ChatDraftHandover) {
    const previous = getConfig()
    updateConfig({ ...previous, mode: next.mode, placement: next.placement, pinned: next.pinned })

    if (next.mode !== previous.mode) {
      if (draft)
        pendingDraft = draft
      await modeSwitch.show()
      return
    }

    if (next.placement !== previous.placement || next.pinned !== previous.pinned)
      await modeSwitch.run(async () => floating.applyPlacement())
  }

  return {
    open: () => modeSwitch.run(async () => {
      if (getConfig().mode === 'floating')
        await floating.open()
      else
        await openLegacy()
    }),
    toggle: () => modeSwitch.run(async () => {
      if (getConfig().mode === 'floating')
        await floating.toggle()
      else
        toggleWindowShow(await legacy.getWindow())
    }),
  }
}
