import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { InferOutput } from 'valibot'

import type { ChatButtonState, ChatDraftHandover, ChatWindowMode, ChatWindowPreferences } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { WidgetsWindowManager } from '../widgets'

import { join, resolve } from 'node:path'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext as createElectronContext } from '@moeru/eventa/adapters/electron/main'
import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow, ipcMain } from 'electron'
import { boolean, number, object, optional, picklist } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import {
  electronChatWindowCollectDraft,
  electronChatWindowDraftSettled,
  electronChatWindowGetPreferences,
  electronChatWindowSetPreferences,
  electronChatWindowTakeDraft,
} from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation } from '../shared'
import { setupFloatingChatWindow } from './floating'
import { createChatModeSwitch } from './mode-switch'
import { setupChatWindowElectronInvokes } from './rpc/index.electron'

type EventaContext = ReturnType<typeof createContext>['context']

const chatWindowConfigSchema = object({
  mode: picklist(['legacy', 'floating']),
  placement: picklist(['attached', 'free']),
  pinned: boolean(),
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

/**
 * Longest wait for a chat window to hand over its draft. The renderer first
 * lets pending image reads finish, and large images take a few seconds to
 * compress. A window that misses it stops the switch and keeps its draft.
 */
const draftCollectTimeout = 10_000

/** Opens the chat in the mode the user chose. */
export interface ChatWindowManager {
  /** Shows the chat and brings it to the front. Spotlight notifications call this. */
  open: () => Promise<void>
  /**
   * Runs the Controls Island chat button. The legacy window comes to the
   * front; the floating chat folds when it is shown and unfolds otherwise.
   */
  toggle: () => Promise<void>
  getButtonState: () => ChatButtonState
  /** Calls `listener` whenever the button state changes. Returns the function that stops it. */
  onButtonStateChange: (listener: (state: ChatButtonState) => void) => () => void
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
   * Asks a chat renderer for its unsent draft. Each chat window adds its own
   * entry in setupDraftHandover, and the entry goes away with the window.
   */
  const draftCollectors = new WeakMap<BrowserWindow, () => Promise<ChatDraftHandover | undefined>>()

  async function collectDraft(window: BrowserWindow | undefined) {
    // A closed window or a crashed renderer has no draft left to carry.
    if (!window || isRendererUnavailable(window))
      return undefined
    return draftCollectors.get(window)?.()
  }

  async function setupChatInvokes(window: BrowserWindow, context: EventaContext, mode: ChatWindowMode) {
    await setupChatWindowElectronInvokes({
      context,
      window,
      widgetsManager: params.widgetsManager,
      serverChannel: params.serverChannel,
      mcpStdioManager: params.mcpStdioManager,
      i18n: params.i18n,
    })

    defineInvokeHandler(context, electronChatWindowGetPreferences, () => getPreferences())
    // A switch that succeeds closes the window that asked for it, and its
    // reply goes nowhere. A switch that fails answers with the error, and the
    // menu reads the saved preferences again.
    defineInvokeHandler(context, electronChatWindowSetPreferences, async (preferences) => {
      if (preferences)
        await setPreferences(preferences)
    })
    setupDraftHandover(window, context, mode)
  }

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

    try {
      await setupChatInvokes(window, context, 'legacy')
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

  const buttonStateListeners = new Set<(state: ChatButtonState) => void>()

  const floating = setupFloatingChatWindow({
    getMainWindow: params.getMainWindow,
    getPlacement: () => getConfig().placement,
    getPinned: () => getConfig().pinned,
    getBounds: () => getConfig().floating,
    saveBounds: bounds => updateConfig({ ...getConfig(), floating: bounds }),
    setupChatInvokes: (window, context) => setupChatInvokes(window, context, 'floating'),
    onFoldedChange: () => emitButtonState(),
  })

  function getButtonState(): ChatButtonState {
    const mode = getConfig().mode
    return { mode, floatingShown: mode === 'floating' && floating.isUnfolded() }
  }

  function emitButtonState() {
    const state = getButtonState()
    for (const listener of buttonStateListeners)
      listener(state)
  }

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
    setMode: mode => updateConfig({ ...getConfig(), mode }),
    legacy: { open: openLegacy, close: legacy.close, collectDraft: async () => collectDraft(legacy.getOpenWindow()) },
    floating: { open: floating.open, close: floating.close, collectDraft: async () => collectDraft(floating.getOpenWindow()) },
  })

  /**
   * Lets the mode switch collect this window's draft when it closes the
   * window, and hand a draft to it when it opens the window. `mode` is the
   * correlation key of the handover.
   */
  function setupDraftHandover(window: BrowserWindow, context: EventaContext, mode: ChatWindowMode) {
    defineInvokeHandler(context, electronChatWindowTakeDraft, () => modeSwitch.takeDraft(mode))
    defineInvokeHandler(context, electronChatWindowDraftSettled, (payload) => {
      modeSwitch.settleDraft(mode, payload?.restored ?? false)
    })

    const requestDraft = defineInvoke(context, electronChatWindowCollectDraft)
    draftCollectors.set(window, () => requestDraft(undefined, { signal: AbortSignal.timeout(draftCollectTimeout) }))
  }

  async function setPreferences(next: ChatWindowPreferences) {
    // The placement is saved first, so a floating window that the mode switch
    // below creates starts in it.
    await modeSwitch.run(async () => {
      const previous = getConfig()
      updateConfig({ ...previous, placement: next.placement, pinned: next.pinned })
      if (next.placement !== previous.placement || next.pinned !== previous.pinned)
        floating.applyPlacement()
    })

    try {
      await modeSwitch.switchTo(next.mode)
    }
    finally {
      emitButtonState()
    }
  }

  return {
    open: modeSwitch.show,
    toggle: () => modeSwitch.run(async () => {
      if (getConfig().mode === 'floating')
        await floating.toggle()
      else
        await openLegacy()
    }),
    getButtonState,
    onButtonStateChange(listener) {
      buttonStateListeners.add(listener)
      return () => buttonStateListeners.delete(listener)
    },
  }
}
