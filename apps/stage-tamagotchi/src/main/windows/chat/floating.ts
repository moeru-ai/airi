import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { Rectangle } from 'electron'

import type { ChatFloatingPlacement, ChatFloatingState } from '../../../shared/eventa'
import type { AttachedChatLayout } from './floating-placement'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext as createElectronContext } from '@moeru/eventa/adapters/electron/main'
import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'
import { animate } from 'animejs'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { debounce } from 'es-toolkit'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import {
  electronChatFloatingContentHidden,
  electronChatFloatingGetState,
  electronChatFloatingMoveBy,
  electronChatFloatingResizeBy,
  electronChatFloatingStateChanged,
} from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { protectPrivilegedWindowNavigation, transparentWindowConfig } from '../shared/window'
import { attachedChatOffset, chooseAttachedChatLayout, preferredAttachedChatLayout, resizeFloatingChatFromGrip } from './floating-placement'

type EventaContext = ReturnType<typeof createContext>['context']

/** Floating chat bounds that the chat window config persists. */
export interface FloatingChatBounds {
  width: number
  height: number
  /** Position in `free` placement. Attached placement derives it from the main window. */
  x?: number
  y?: number
}

/** The transparent chat window of the `floating` chat mode. */
export interface FloatingChatWindow {
  /** Shows the chat unfolded and focused, creating the window when needed. */
  open: () => Promise<void>
  /** Folds a shown chat, or opens a folded or hidden one. The chat button calls this. */
  toggle: () => Promise<void>
  /** Destroys the window, when the user switches to the legacy mode. */
  close: () => void
  /** Moves the window into the persisted placement. */
  applyPlacement: () => void
}

function clampIntoWorkArea(bounds: Rectangle): Rectangle {
  const workArea = screen.getDisplayMatching(bounds).workArea
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - bounds.width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - bounds.height),
  }
}

/**
 * Owns the floating chat window: its placement beside the main window, the
 * fold that the chat button drives, and the resize grip.
 *
 * State model:
 * - `folded` is the chat button state. It starts `true` because no chat is
 *   shown yet. The renderer animates a fold first; the window hides when the
 *   renderer reports {@link electronChatFloatingContentHidden}.
 * - `layout` is where attached placement puts the chat against the main
 *   window. It changes only when the current layout stops fitting, or when the
 *   preferred one fits again.
 * - `relocating` is `true` while the chat moves to the other side of the main
 *   window. The renderer folds the content toward the character, the window
 *   moves while the content is hidden, and the content unfolds on the new side.
 * - `slide` animates a change of the vertical anchor, which does not cross
 *   the character.
 * - The window itself is created on the first open and destroyed on a switch
 *   to the legacy mode. Its eventa context disposes with it.
 */
export function setupFloatingChatWindow(params: {
  getMainWindow: () => BrowserWindow | undefined
  getPlacement: () => ChatFloatingPlacement
  /** Whether a `free` chat stays above other windows. */
  getPinned: () => boolean
  getBounds: () => FloatingChatBounds
  saveBounds: (bounds: FloatingChatBounds) => void
  /** Registers the services that every chat renderer uses, shared with the legacy window. */
  setupChatInvokes: (window: BrowserWindow, context: EventaContext) => Promise<void>
}): FloatingChatWindow {
  let window: BrowserWindow | undefined
  let creating: Promise<BrowserWindow> | undefined
  let context: EventaContext | undefined
  let folded = true
  let layout: AttachedChatLayout = { ...preferredAttachedChatLayout }
  let relocating = false
  /** The chat window's own always-on-top state, as its `always-on-top-changed` events report it. */
  let pinned = false
  let slide: ReturnType<typeof animate> | undefined
  let detachFromMain: (() => void) | undefined

  function currentState(): ChatFloatingState {
    const placement = params.getPlacement()
    return {
      placement,
      side: placement === 'attached' ? layout.side : 'left',
      folded,
      relocating,
      pinned,
    }
  }

  function emitState() {
    context?.emit(electronChatFloatingStateChanged, currentState())
  }

  function attachedPosition(main: BrowserWindow, target: BrowserWindow) {
    const mainBounds = main.getBounds()
    const offset = attachedChatOffset(mainBounds, target.getBounds(), screen.getDisplayMatching(mainBounds).workArea, layout)
    return { x: mainBounds.x + offset.x, y: mainBounds.y + offset.y }
  }

  function moveToLayout(main: BrowserWindow, target: BrowserWindow) {
    const position = attachedPosition(main, target)
    const bounds = target.getBounds()
    if (bounds.x !== position.x || bounds.y !== position.y)
      target.setPosition(position.x, position.y)
  }

  function stopSlide() {
    slide?.pause()
    slide = undefined
  }

  /**
   * Moves the chat to a new vertical anchor over a short animation. Each frame
   * places the chat from the current main window position, so a drag that
   * continues during the slide does not leave the chat behind.
   */
  function slideToLayout(main: BrowserWindow, target: BrowserWindow) {
    stopSlide()
    const mainBounds = main.getBounds()
    const bounds = target.getBounds()
    const offset = { x: bounds.x - mainBounds.x, y: bounds.y - mainBounds.y }
    const to = attachedChatOffset(mainBounds, bounds, screen.getDisplayMatching(mainBounds).workArea, layout)

    slide = animate(offset, {
      x: to.x,
      y: to.y,
      duration: 220,
      ease: 'outCubic',
      onRender: () => {
        if (target.isDestroyed() || main.isDestroyed())
          return
        const current = main.getBounds()
        target.setPosition(Math.round(current.x + offset.x), Math.round(current.y + offset.y))
      },
      onComplete: () => {
        slide = undefined
      },
    })
  }

  function finishRelocation(main: BrowserWindow, target: BrowserWindow) {
    relocating = false
    const mainBounds = main.getBounds()
    // The main window may have moved on while the content folded.
    layout = chooseAttachedChatLayout(mainBounds, target.getBounds(), screen.getDisplayMatching(mainBounds).workArea, layout)
    moveToLayout(main, target)
    emitState()
  }

  function followMain(main: BrowserWindow, target: BrowserWindow) {
    if (target.isDestroyed() || relocating)
      return

    const mainBounds = main.getBounds()
    const next = chooseAttachedChatLayout(mainBounds, target.getBounds(), screen.getDisplayMatching(mainBounds).workArea, layout)
    const sideChanged = next.side !== layout.side
    const anchorChanged = next.anchor !== layout.anchor

    // A hidden chat has nothing to animate.
    if (!target.isVisible() || folded) {
      stopSlide()
      layout = next
      moveToLayout(main, target)
      if (sideChanged)
        emitState()
      return
    }

    if (sideChanged) {
      // The layout changes in finishRelocation. Until then the renderer folds
      // toward the character on the old side.
      stopSlide()
      relocating = true
      emitState()
      // A renderer that cannot animate would never report the content hidden.
      if (isRendererUnavailable(target))
        finishRelocation(main, target)
      return
    }

    if (anchorChanged) {
      layout = next
      slideToLayout(main, target)
      return
    }

    // A running slide places the chat on every frame.
    if (!slide)
      moveToLayout(main, target)
  }

  /**
   * Keeps an attached chat beside the main window.
   *
   * While the chat does not have keyboard focus, it is a child window of the
   * main window, and the window manager moves it with the main window. This
   * matters on macOS: the window server drags the main window by itself and
   * reports few `move` events during the drag, so a chat that only answered
   * them would trail far behind.
   *
   * While the chat has keyboard focus, it leaves the main window. A child
   * takes its parent's window level, and the main window's level covers the
   * input method candidates of the text typed into the chat. The two states
   * do not overlap: a drag of the main window moves the focus to it.
   *
   * The `move` and `resize` handlers run in both states. They place a chat
   * that the window manager did not move with its parent, and they change the
   * layout when the current one stops fitting.
   */
  function attachToMain(target: BrowserWindow) {
    const main = params.getMainWindow()
    if (!main || main.isDestroyed())
      return

    const follow = () => followMain(main, target)
    const hideWithMain = () => target.hide()
    const showWithMain = () => {
      if (!folded)
        target.showInactive()
    }
    const followAlwaysOnTop = (_: Electron.Event, isAlwaysOnTop: boolean) => target.setAlwaysOnTop(isAlwaysOnTop)
    const linkToMain = () => target.setParentWindow(main)
    // Leaving the parent does not restore the chat's own window level.
    const unlinkFromMain = () => {
      target.setParentWindow(null)
      target.setAlwaysOnTop(main.isAlwaysOnTop())
    }

    const mainBounds = main.getBounds()
    layout = chooseAttachedChatLayout(mainBounds, target.getBounds(), screen.getDisplayMatching(mainBounds).workArea, preferredAttachedChatLayout)
    moveToLayout(main, target)
    target.setAlwaysOnTop(main.isAlwaysOnTop())
    if (!target.isFocused())
      linkToMain()
    target.on('focus', unlinkFromMain)
    target.on('blur', linkToMain)
    main.on('move', follow)
    main.on('resize', follow)
    main.on('hide', hideWithMain)
    main.on('show', showWithMain)
    main.on('always-on-top-changed', followAlwaysOnTop)

    detachFromMain = () => {
      stopSlide()
      main.off('move', follow)
      main.off('resize', follow)
      main.off('hide', hideWithMain)
      main.off('show', showWithMain)
      main.off('always-on-top-changed', followAlwaysOnTop)
      if (!target.isDestroyed()) {
        target.off('focus', unlinkFromMain)
        target.off('blur', linkToMain)
        unlinkFromMain()
      }
    }
  }

  function applyPlacementTo(target: BrowserWindow) {
    detachFromMain?.()
    detachFromMain = undefined

    // The chat pins with Electron's default level, never the shared
    // `setWindowAlwaysOnTop`: that level also covers the input method
    // candidates, and the chat takes text. An attached chat takes the main
    // window's pin state in attachToMain.
    if (params.getPlacement() === 'attached')
      attachToMain(target)
    else
      target.setAlwaysOnTop(params.getPinned())

    emitState()
  }

  function moveBy(target: BrowserWindow, delta: { deltaX: number, deltaY: number }) {
    if (params.getPlacement() !== 'free')
      return

    const bounds = target.getBounds()
    target.setPosition(bounds.x + Math.round(delta.deltaX), bounds.y + Math.round(delta.deltaY))
  }

  function persistBounds(target: BrowserWindow) {
    const bounds = target.getBounds()
    // Attached placement derives the position from the main window, so only
    // free placement owns one worth keeping.
    const position = params.getPlacement() === 'free' ? { x: bounds.x, y: bounds.y } : {}
    params.saveBounds({ width: bounds.width, height: bounds.height, ...position })
  }

  function resizeBy(target: BrowserWindow, delta: { deltaX: number, deltaY: number }) {
    const bounds = target.getBounds()
    const main = params.getMainWindow()

    if (params.getPlacement() === 'attached' && main && !main.isDestroyed()) {
      // The layout stays during a resize, so the chat never jumps to the other
      // side under the cursor.
      stopSlide()
      const size = resizeFloatingChatFromGrip(bounds, delta, layout, screen.getDisplayMatching(bounds).workArea)
      target.setSize(size.width, size.height)
      moveToLayout(main, target)
    }
    else {
      // Free placement keeps the bottom-right corner, opposite the grip.
      const size = resizeFloatingChatFromGrip(bounds, delta, preferredAttachedChatLayout, screen.getDisplayMatching(bounds).workArea)
      target.setBounds({
        x: bounds.x + bounds.width - size.width,
        y: bounds.y + bounds.height - size.height,
        ...size,
      })
    }

    persistBounds(target)
  }

  async function createWindow() {
    const saved = params.getBounds()
    const target = new BrowserWindow({
      title: 'Chat',
      width: saved.width,
      height: saved.height,
      show: false,
      icon,
      // The resize grip in the renderer owns resizing. Transparent windows do
      // not resize reliably from native edges.
      resizable: false,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
      ...transparentWindowConfig(),
    })

    if (params.getPlacement() === 'free' && saved.x != null && saved.y != null)
      target.setBounds(clampIntoWorkArea({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }))

    target.setVisibleOnAllWorkspaces(true)
    if (isMacOS) {
      target.setFullScreenable(false)
      target.setWindowButtonVisibility(false)
    }
    // The renderer turns click-through off while the cursor is over a bubble
    // or a control. `forward` keeps mouse moves coming while it is on.
    target.setIgnoreMouseEvents(true, { forward: true })
    protectPrivilegedWindowNavigation(target)

    ipcMain.setMaxListeners(0)
    // `onlySameWindow` hears only this window and disposes with it.
    const { context: targetContext } = createElectronContext(ipcMain, target, { onlySameWindow: true })
    context = targetContext
    // Every platform reports `move`; `moved` is only on macOS and Windows.
    const persistMove = debounce(() => {
      if (!target.isDestroyed())
        persistBounds(target)
    }, 300)
    target.on('move', persistMove)
    target.on('always-on-top-changed', (_, isAlwaysOnTop) => {
      pinned = isAlwaysOnTop
      emitState()
    })
    // Registered before any await, so a window that fails during setup
    // still releases the main window listeners when it is destroyed.
    target.on('closed', () => {
      persistMove.cancel()
      detachFromMain?.()
      detachFromMain = undefined
      if (window === target || !window) {
        window = undefined
        context = undefined
        folded = true
        relocating = false
        pinned = false
      }
    })

    defineInvokeHandler(targetContext, electronChatFloatingGetState, () => currentState())
    defineInvokeHandler(targetContext, electronChatFloatingContentHidden, () => {
      // A fold wins over a relocation: the next open places the chat anyway.
      // An unfold that overtook the animation leaves the window shown.
      if (folded) {
        relocating = false
        target.hide()
        return
      }

      const main = params.getMainWindow()
      if (relocating && main && !main.isDestroyed())
        finishRelocation(main, target)
    })
    defineInvokeHandler(targetContext, electronChatFloatingResizeBy, (delta) => {
      if (delta)
        resizeBy(target, delta)
    })
    defineInvokeHandler(targetContext, electronChatFloatingMoveBy, (delta) => {
      if (delta)
        moveBy(target, delta)
    })

    try {
      await params.setupChatInvokes(target, targetContext)
      applyPlacementTo(target)
      await load(target, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/chat-floating', {
        query: {
          'stage-runtime': 'minimal',
          'synced-leader': 'false',
        },
      }))
    }
    catch (error) {
      target.destroy()
      throw error
    }

    return target
  }

  async function ensureWindow() {
    if (window && !isRendererUnavailable(window))
      return window

    creating ??= createWindow().then((created) => {
      window = created
      return created
    }).finally(() => {
      creating = undefined
    })

    return creating
  }

  async function open() {
    const target = await ensureWindow()
    folded = false
    emitState()

    if (target.isMinimized())
      target.restore()
    target.show()
    target.focus()
    target.moveTop()
  }

  function fold(target: BrowserWindow) {
    folded = true
    // A renderer that cannot animate would never report the fold as settled.
    if (isRendererUnavailable(target)) {
      target.hide()
      return
    }

    emitState()
  }

  return {
    open,
    async toggle() {
      if (window && !window.isDestroyed() && window.isVisible() && !folded) {
        fold(window)
        return
      }

      await open()
    },
    close() {
      window?.destroy()
    },
    applyPlacement() {
      if (window && !window.isDestroyed())
        applyPlacementTo(window)
    },
  }
}
