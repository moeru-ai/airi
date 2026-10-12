import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { InferOutput } from 'valibot'

import type { ChatButtonState, ChatDraftHandover, ChatWindowMode, ChatWindowPreferences } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpManager } from '../../services/airi/mcp-servers'
import type { SettingsWindowManager } from '../settings'
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
  mode: picklist(['legacy', 'floating', 'fullscreen']),
  placement: picklist(['attached', 'free', 'danmaku']),
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
 * The floating chat beside the character is the default, so users try it and
 * give feedback. The style menu in both chat windows switches back to the
 * legacy window. The floating size fits the composer and a few bubbles beside
 * the default 450x600 main window.
 */
const defaultChatWindowConfig: ChatWindowConfig = {
  mode: 'floating',
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

/**
 * A window that carries the `fullscreen` chat mode. It shows the chat in the fullscreen mode, and the mode has no chat
 * window of its own. The main window is one, and the window of the `multi-window` mode is another.
 */
export interface FullscreenChatHost {
  window: BrowserWindow
  /** The context of the window. The chat preferences and the draft handover of the fullscreen chat go through it. */
  context: EventaContext
  /** Closes the fullscreen mode of this window, once the chat has moved to the window of another chat mode. */
  close: () => void
  /** Whether this window keeps the chat mounted, shown or hidden, so it has a composer to collect the draft from. */
  hasChat: () => boolean
  /** Whether the fullscreen mode shows in this window, as the user chose. Only one host answers `true` at a time. */
  isActive: () => boolean
}

/** Opens the chat in the mode the user chose. */
export interface ChatWindowManager {
  /** Shows the chat and brings it to the front. Spotlight notifications call this. */
  open: () => Promise<void>
  /**
   * Runs the Controls Island chat button. The legacy window comes to the
   * front; the floating chat folds when it is shown and unfolds otherwise;
   * the fullscreen chat opens in the main window.
   */
  toggle: () => Promise<void>
  getButtonState: () => ChatButtonState
  /** Calls `listener` whenever the button state changes. Returns the function that stops it. */
  onButtonStateChange: (listener: (state: ChatButtonState) => void) => () => void
  /**
   * Lets a window carry the `fullscreen` chat mode. A host calls it once its window exists, and calls the function it
   * returns when the window closes.
   */
  attachFullscreen: (host: FullscreenChatHost) => () => void
  /** Hides the floating chat while the main window covers its display, and shows it again after. */
  setMainWindowCovered: (covered: boolean) => void
  /**
   * Moves a chat in the fullscreen mode to the default mode, when the user turns the fullscreen mode experiment off.
   * A mounted fullscreen chat switches with its draft. Otherwise only the saved mode changes, and no window opens.
   */
  leaveFullscreenMode: () => Promise<void>
}

/**
 * Owns the chat windows and the persisted choice between the chat modes.
 *
 * Every mode loads the same chat components and registers the same services,
 * so a mode changes only the window around the chat. Transparency is fixed
 * when Electron creates a window, so the legacy and floating modes have their
 * own windows, and the fullscreen mode lives in the main window. A mode
 * switch closes one and opens the other.
 */
export function setupChatWindowManager(params: {
  getMainWindow: () => BrowserWindow | undefined
  openSettingsWindow: SettingsWindowManager['openWindow']
  /** Shows the chat in the fullscreen mode, in the window that the mode names. It creates that window when needed. */
  openFullscreenChat: () => void | Promise<void>
  widgetsManager: WidgetsWindowManager
  serverChannel: ServerChannel
  mcpManager: McpManager
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
      mcpManager: params.mcpManager,
      i18n: params.i18n,
      openSettingsWindow: params.openSettingsWindow,
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

  /** The windows that can carry the fullscreen chat. Without an active one, the fullscreen chat has nowhere to show. */
  const fullscreenHosts = new Set<FullscreenChatHost>()
  const fullscreenHost = () => [...fullscreenHosts].find(host => host.isActive())

  const modeSwitch = createChatModeSwitch({
    getMode: () => getConfig().mode,
    setMode: mode => updateConfig({ ...getConfig(), mode }),
    windows: {
      legacy: { open: openLegacy, close: legacy.close, collectDraft: async () => collectDraft(legacy.getOpenWindow()) },
      floating: { open: floating.open, close: floating.close, collectDraft: async () => collectDraft(floating.getOpenWindow()) },
      fullscreen: {
        open: async () => params.openFullscreenChat(),
        close: () => fullscreenHost()?.close(),
        // A host that never showed the chat has no chat composer to answer.
        collectDraft: async () => {
          const host = fullscreenHost()
          return host?.hasChat() ? collectDraft(host.window) : undefined
        },
      },
    },
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
      const mode = getConfig().mode
      if (mode === 'floating')
        await floating.toggle()
      else if (mode === 'fullscreen')
        await params.openFullscreenChat()
      else
        await openLegacy()
    }),
    getButtonState,
    onButtonStateChange(listener) {
      buttonStateListeners.add(listener)
      return () => buttonStateListeners.delete(listener)
    },
    attachFullscreen(host) {
      fullscreenHosts.add(host)
      // A host already registers the services that every chat renderer uses, so it only needs the chat preferences
      // and the draft handover.
      defineInvokeHandler(host.context, electronChatWindowGetPreferences, () => getPreferences())
      defineInvokeHandler(host.context, electronChatWindowSetPreferences, async (preferences) => {
        if (preferences)
          await setPreferences(preferences)
      })
      setupDraftHandover(host.window, host.context, 'fullscreen')
      return () => fullscreenHosts.delete(host)
    },
    setMainWindowCovered: covered => floating.setCovered(covered),
    async leaveFullscreenMode() {
      if (getConfig().mode !== 'fullscreen')
        return
      try {
        if (fullscreenHost()?.hasChat())
          await modeSwitch.switchTo(defaultChatWindowConfig.mode)
        else
          await modeSwitch.run(async () => updateConfig({ ...getConfig(), mode: defaultChatWindowConfig.mode }))
      }
      finally {
        emitButtonState()
      }
    },
  }
}
