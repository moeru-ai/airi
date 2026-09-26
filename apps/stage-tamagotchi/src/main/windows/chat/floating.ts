import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { ResizeDirection } from '@proj-airi/electron-eventa'
import type { Point } from 'electron'

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
  electronChatFloatingMoveTo,
  electronChatFloatingResizeBy,
  electronChatFloatingStateChanged,
} from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation, resizeBoundsByDelta, transparentWindowConfig } from '../shared/window'
import { attachedChatOffset, chooseAttachedChatLayout, keepChatOnDisplay, preferredAttachedChatLayout, wholePixels } from './floating-placement'

type EventaContext = ReturnType<typeof createContext>['context']

/** Smallest floating chat that still shows the composer above one short bubble. */
const minimumSize = { width: 300, height: 260 }

/** Floating chat bounds that the chat window config persists. */
interface FloatingChatBounds {
  width: number
  height: number
  /** Position in `free` placement. Attached placement derives it from the main window. */
  x?: number
  y?: number
}

/** The transparent chat window of the `floating` chat mode. */
interface FloatingChatWindow {
  /** Shows the chat unfolded and focused, creating the window when needed. */
  open: () => Promise<void>
  /** Folds a shown chat, or opens a folded or hidden one. The chat button calls this. */
  toggle: () => Promise<void>
  /** Closes the window, including one that is still being created. */
  close: () => void
  /** Returns the window without creating one. */
  getOpenWindow: () => BrowserWindow | undefined
  /** Moves the window into the persisted placement. */
  applyPlacement: () => void
  /** Whether the chat is unfolded, which the chat button shows as pressed. */
  isUnfolded: () => boolean
}

/**
 * The resize grip sits on the top corner away from the character, and the
 * chat grows away from the edges it shares with the main window: a bottom
 * anchored chat grows up, a top anchored one down.
 */
function gripDirection(layout: AttachedChatLayout): ResizeDirection {
  const vertical = layout.anchor === 'bottom' ? 'n' : 's'
  const horizontal = layout.side === 'left' ? 'w' : 'e'
  return `${vertical}${horizontal}`
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
  /** Called when the chat folds or unfolds. */
  onFoldedChange: () => void
}): FloatingChatWindow {
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

  function setFolded(value: boolean) {
    if (folded === value)
      return
    folded = value
    params.onFoldedChange()
  }

  function moveToLayout(main: BrowserWindow, target: BrowserWindow) {
    const mainBounds = main.getBounds()
    const bounds = target.getBounds()
    const offset = attachedChatOffset(mainBounds, bounds, screen.getDisplayMatching(mainBounds).workArea, layout)
    const x = mainBounds.x + offset.x
    const y = mainBounds.y + offset.y
    // A child window has already moved with the main window, so this is
    // usually a no-op during a drag.
    if (bounds.x !== x || bounds.y !== y)
      target.setPosition(x, y)
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
        target.setPosition(wholePixels(current.x + offset.x), wholePixels(current.y + offset.y))
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
   * On macOS, while the chat does not have keyboard focus, it is a child
   * window of the main window, and the window server moves it with the main
   * window. The window server drags the main window by itself and reports few
   * `move` events during the drag, so a chat that only answered them would
   * trail far behind.
   *
   * On macOS, while the chat has keyboard focus, it leaves the main window. A
   * child takes its parent's window level, and the main window's level covers
   * the input method candidates of the text typed into the chat.
   *
   * The `move` and `resize` handlers run on every platform. They place a chat
   * that the window manager did not move with the main window, and they
   * change the layout when the current one stops fitting.
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
    // NOTICE:
    // Only macOS moves a child window with its parent during a drag, so only
    // macOS links the chat. With this link, the attached chat on Windows
    // flickered and used much CPU; the unlinked free chat did not.
    // Removal condition: a Windows build that keeps the link stable.
    const linksToMain = isMacOS
    if (linksToMain) {
      if (!target.isFocused())
        linkToMain()
      target.on('focus', unlinkFromMain)
      target.on('blur', linkToMain)
    }
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
      if (linksToMain && !target.isDestroyed()) {
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

  function moveTo(target: BrowserWindow, position: Point) {
    if (params.getPlacement() !== 'free')
      return

    const { width, height } = target.getBounds()
    target.setBounds(keepChatOnDisplay({ ...position, width, height }, screen.getAllDisplays()))
  }

  function persistBounds(target: BrowserWindow) {
    const bounds = target.getBounds()
    // Attached placement derives the position from the main window, so only
    // free placement owns one worth keeping.
    const position = params.getPlacement() === 'free' ? { x: bounds.x, y: bounds.y } : {}
    params.saveBounds({ width: bounds.width, height: bounds.height, ...position })
  }

  function resizeBy(target: BrowserWindow, delta: { deltaX: number, deltaY: number }) {
    const main = params.getMainWindow()
    const attachedTo = params.getPlacement() === 'attached' && main && !main.isDestroyed() ? main : undefined

    // The layout stays during a resize, so the chat never jumps to the other
    // side under the cursor. A free chat has its grip at the top-left.
    stopSlide()
    const resized = resizeBoundsByDelta(target.getBounds(), {
      ...delta,
      direction: attachedTo ? gripDirection(layout) : 'nw',
      minWidth: minimumSize.width,
      minHeight: minimumSize.height,
    })
    // The chat stops growing at the edges of the work area, so the grip stays
    // in reach.
    target.setBounds(keepChatOnDisplay(resized, screen.getAllDisplays()))
    if (attachedTo)
      moveToLayout(attachedTo, target)

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

    // The saved position may be on a display that is gone or smaller now.
    if (params.getPlacement() === 'free' && saved.x != null && saved.y != null)
      target.setBounds(keepChatOnDisplay({ x: saved.x, y: saved.y, width: saved.width, height: saved.height }, screen.getAllDisplays()))

    target.setVisibleOnAllWorkspaces(true)
    if (isMacOS) {
      target.setFullScreenable(false)
      target.setWindowButtonVisibility(false)
    }
    // The renderer turns click-through off while the cursor is over a bubble
    // or a control. `forward` keeps mouse moves coming while it is on.
    target.setIgnoreMouseEvents(true, { forward: true })
    protectPrivilegedWindowNavigation(target)

    // `onlySameWindow` hears only this window and disposes with it.
    const { context: targetContext } = createElectronContext(ipcMain, target, { onlySameWindow: true })
    context = targetContext
    // Every platform reports `move`; `moved` is only on macOS and Windows.
    // Only a free chat owns its position; an attached one follows the main
    // window, and the grip saves its size.
    const persistMove = debounce(() => {
      if (!target.isDestroyed() && params.getPlacement() === 'free')
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
      if (context === targetContext) {
        context = undefined
        setFolded(true)
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
    defineInvokeHandler(targetContext, electronChatFloatingMoveTo, (position) => {
      if (position)
        moveTo(target, position)
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

  const reusable = createReusableWindow(createWindow)

  async function open() {
    const target = await reusable.getWindow()
    setFolded(false)
    emitState()

    if (target.isMinimized())
      target.restore()
    target.show()
    target.focus()
    target.moveTop()
  }

  function fold(target: BrowserWindow) {
    setFolded(true)
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
      const window = reusable.getOpenWindow()
      if (window && window.isVisible() && !folded) {
        fold(window)
        return
      }

      await open()
    },
    close: reusable.close,
    getOpenWindow: reusable.getOpenWindow,
    applyPlacement() {
      const window = reusable.getOpenWindow()
      if (window)
        applyPlacementTo(window)
    },
    isUnfolded: () => !folded,
  }
}
