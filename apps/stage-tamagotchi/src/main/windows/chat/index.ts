import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { InferOutput } from 'valibot'

import type { ChatButtonState, ChatDraftHandover, ChatWindowMode, ChatWindowPreferences, FullscreenSurfaceId } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { McpManager } from '../../services/airi/mcp-servers'
import type { SettingsWindowManager } from '../settings'
import type { WidgetsWindowManager } from '../widgets'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow, ipcMain } from 'electron'
import { isMacOS } from 'std-env'
import { boolean, number, object, optional, picklist } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import {
  electronChatWindowCollectDraft,
  electronChatWindowDraftOffered,
  electronChatWindowDraftSettled,
  electronChatWindowGetPreferences,
  electronChatWindowSetPreferences,
  electronChatWindowTakeDraft,
  electronFullscreenClose,
} from '../../../shared/eventa'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { createWindowContext } from '../../libs/electron/window-context'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation } from '../shared'
import { setupFloatingChatWindow } from './floating'
import { createChatModeSwitch } from './mode-switch'
import { setupChatWindowElectronInvokes } from './rpc/index.electron'

type EventaContext = ReturnType<typeof createContext>['context']

const chatWindowConfigSchema = object({
  mode: picklist(['legacy', 'floating', 'fullscreen']),
  placement: picklist(['attached', 'free']),
  // A saved config without this field shows the chat without the message feed.
  danmaku: optional(boolean(), false),
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
  danmaku: false,
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
  /** The surfaces that the page keeps mounted, shown or hidden, as it reports them. */
  mounted: () => readonly FullscreenSurfaceId[]
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
    const { mode, placement, danmaku, pinned } = getConfig()
    return { mode, placement, danmaku, pinned }
  }

  /**
   * The two requests of a draft handover to a chat renderer: `collect` asks for its unsent draft, and `offer` tells
   * it that a switch carries a draft to it. Each chat window adds its own entry in setupDraftHandover, and the entry
   * goes away with the window.
   */
  const draftHandovers = new WeakMap<BrowserWindow, { collect: () => Promise<ChatDraftHandover | undefined>, offer: () => void }>()

  async function collectDraft(window: BrowserWindow | undefined) {
    // A closed window or a crashed renderer has no draft left to carry.
    if (!window || isRendererUnavailable(window))
      return undefined
    return draftHandovers.get(window)?.collect()
  }

  function offerDraft(window: BrowserWindow | undefined) {
    if (window && !isRendererUnavailable(window))
      draftHandovers.get(window)?.offer()
  }

  /**
   * Answers the style menu of a chat. `mode` is the mode of that chat, so the menu shows the style that the user
   * looks at, and a choice moves the chat from there.
   */
  function setupPreferences(context: EventaContext, mode: ChatWindowMode) {
    defineInvokeHandler(context, electronChatWindowGetPreferences, () => ({ ...getPreferences(), mode }))
    // Each control sends only what it changes, so a control that holds older
    // preferences never writes them back. A request without a mode keeps the
    // chat in the mode that it shows. A switch that succeeds closes the window
    // that asked for it, and its reply goes nowhere. A switch that fails
    // answers with the error, and the menu reads the preferences again.
    defineInvokeHandler(context, electronChatWindowSetPreferences, async (changes) => {
      if (changes)
        await setPreferences({ ...getPreferences(), mode, ...changes }, mode)
    })
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

    setupPreferences(context, mode)
    setupDraftHandover(window, context, mode)
  }

  const legacy = createReusableWindow(async () => {
    const window = new BrowserWindow({
      title: 'Chat',
      width: 600.0,
      height: 800.0,
      show: false,
      icon,
      ...(isMacOS ? { transparent: true, backgroundColor: '#00000000' } : {}),
      titleBarStyle: isMacOS ? 'hiddenInset' : undefined,
      webPreferences: {
        preload: getPreloadPath(),
        sandbox: false,
      },
    })

    if (isMacOS)
      window.setWindowButtonVisibility(true)
    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)
    // `onlySameWindow` hears only this window and disposes with it, so a mode
    // switch that closes the window leaves no handlers behind.
    const { context } = createWindowContext(window)

    try {
      await setupChatInvokes(window, context, 'legacy')
      await load(window, withHashRoute(baseUrl(getRendererRoot()), '/chat', {
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
    getDanmaku: () => getConfig().danmaku,
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
  /** Whether a host keeps the chat mounted, shown or hidden, so it has a composer to collect the draft from. */
  const hasChat = (host: FullscreenChatHost | undefined) => !!host?.mounted().includes('chat')
  /**
   * Ends the fullscreen mode of the active host, once the chat has moved to the window of another chat mode. A host
   * that shows no chat, such as one that only shows settings, is not a chat window, so it stays open.
   */
  function closeFullscreenChat() {
    const host = fullscreenHost()
    if (host && hasChat(host) && !host.window.isDestroyed())
      host.context.emit(electronFullscreenClose, undefined)
  }

  const modeSwitch = createChatModeSwitch({
    getMode: () => getConfig().mode,
    setMode: mode => updateConfig({ ...getConfig(), mode }),
    windows: {
      legacy: {
        ownsWindow: true,
        isOpen: () => !!legacy.getOpenWindow(),
        open: openLegacy,
        offerDraft: () => offerDraft(legacy.getOpenWindow()),
        close: legacy.close,
        collectDraft: async () => collectDraft(legacy.getOpenWindow()),
      },
      floating: {
        ownsWindow: true,
        isOpen: () => !!floating.getOpenWindow(),
        open: floating.open,
        offerDraft: () => offerDraft(floating.getOpenWindow()),
        close: floating.close,
        collectDraft: async () => collectDraft(floating.getOpenWindow()),
      },
      fullscreen: {
        // The host shows other surfaces too, and its island shows the chat in any saved mode.
        ownsWindow: false,
        isOpen: () => hasChat(fullscreenHost()),
        open: async () => params.openFullscreenChat(),
        offerDraft: () => offerDraft(fullscreenHost()?.window),
        close: closeFullscreenChat,
        // A host that never showed the chat has no chat composer to answer.
        collectDraft: async () => {
          const host = fullscreenHost()
          return host && hasChat(host) ? collectDraft(host.window) : undefined
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
    draftHandovers.set(window, {
      collect: () => requestDraft(undefined, { signal: AbortSignal.timeout(draftCollectTimeout) }),
      offer: () => context.emit(electronChatWindowDraftOffered, undefined),
    })
  }

  /** Saves the preferences. `from` is the mode of the chat where the user chose them. */
  async function setPreferences(next: ChatWindowPreferences, from: ChatWindowMode) {
    // The placement is saved first, so a floating window that the mode switch
    // below creates starts in it.
    await modeSwitch.run(async () => {
      const previous = getConfig()
      updateConfig({ ...previous, placement: next.placement, danmaku: next.danmaku, pinned: next.pinned })
      // Only a new placement attaches the chat again. An attached chat keeps
      // its layout through a new pin or message feed, so it does not jump to
      // the preferred side while the main window stays still.
      if (next.placement !== previous.placement)
        floating.applyPlacement()
      else if (next.danmaku !== previous.danmaku || next.pinned !== previous.pinned)
        floating.applyPreferences()
    })

    try {
      await modeSwitch.switchTo(next.mode, from)
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
      setupPreferences(host.context, 'fullscreen')
      setupDraftHandover(host.window, host.context, 'fullscreen')
      return () => fullscreenHosts.delete(host)
    },
    setMainWindowCovered: covered => floating.setCovered(covered),
    async leaveFullscreenMode() {
      if (getConfig().mode !== 'fullscreen')
        return
      try {
        if (hasChat(fullscreenHost()))
          await modeSwitch.switchTo(defaultChatWindowConfig.mode, 'fullscreen')
        else
          await modeSwitch.run(async () => updateConfig({ ...getConfig(), mode: defaultChatWindowConfig.mode }))
      }
      finally {
        emitButtonState()
      }
    },
  }
}
