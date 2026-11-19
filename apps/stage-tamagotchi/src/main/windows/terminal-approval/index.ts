import type { ApprovalPrompt, TerminalApprovalView } from '../../../shared/eventa/terminal-approval'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { PendingActionManager } from '../../services/airi/computer-use/action-manager'

import { randomUUID } from 'node:crypto'

import { defineInvokeHandler } from '@moeru/eventa'
import { clearClockInterval, setClockInterval } from '@moeru/std'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { terminalApprovalWindow } from '../../../shared/eventa/terminal-approval'
import { showWindow } from '../../libs/electron/focus'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { requireMainFrameSender } from '../../libs/electron/window-context'
import { createReferencedWindowManager } from '../shared/referenced-window'
import { customTitleBarWindowConfig, protectPrivilegedWindowNavigation } from '../shared/window'

/** Confirmation prompts wait for a decision. They do not time out on their own. */
const CONFIRMATION_EXPIRES_AT = Number.MAX_SAFE_INTEGER

/** Reuses AIRI's Main-owned approval window for prepared commands and other gated actions. */
export function setupTerminalApprovalWindow(params: { actions: PendingActionManager, i18n: I18n, serverChannel: ServerChannel }) {
  // Presentation only. The existing action manager retains all authority and settlement state.
  const presentations = new Set<BrowserWindow>()
  const windows = createReferencedWindowManager({
    eventa: terminalApprovalWindow,
    i18n: params.i18n,
    serverChannel: params.serverChannel,
    createWindow: () => {
      const window = new BrowserWindow({
        title: 'AIRI approval',
        width: 560,
        height: 500,
        minWidth: 420,
        minHeight: 360,
        show: false,
        icon,
        ...customTitleBarWindowConfig(),
        webPreferences: { preload: getPreloadPath(), sandbox: false },
      })
      protectPrivilegedWindowNavigation(window)
      return window
    },
    loadRoute: async (window, payload) => {
      await load(window, withHashRoute(baseUrl(getRendererRoot()), `/terminal-approval?id=${payload.id}`, {
        query: { 'synced-leader': 'false', 'stage-runtime': 'minimal' },
      }))
    },
  })

  async function presentView(windowId: string, actionId: string, view: TerminalApprovalView, isPending: () => boolean, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted)
      return false
    const handle = await windows.open({
      id: windowId,
      route: '/terminal-approval',
      type: 'terminal-approval',
      payload: view,
    })
    presentations.add(handle.window)
    handle.window.once('closed', () => presentations.delete(handle.window))
    return await new Promise<boolean>((resolve) => {
      let finished = false
      let timerId: number | undefined
      let abort = () => {}
      const finish = (approved: boolean) => {
        if (finished)
          return
        finished = true
        if (timerId !== undefined)
          clearClockInterval(timerId)
        signal?.removeEventListener('abort', abort)
        resolve(approved)
        // Let the decision IPC reply before closing its sender.
        setImmediate(() => safeClose(handle.window))
      }
      abort = () => finish(false)
      if (signal?.aborted) {
        finish(false)
        return
      }
      signal?.addEventListener('abort', abort, { once: true })
      defineInvokeHandler(handle.context, terminalApprovalWindow.windowAction, (decision, options) => {
        if (requireMainFrameSender(options) !== handle.window.webContents || decision.id !== actionId)
          throw new Error('This approval decision does not belong to its Main-owned window.')
        finish(isPending() && decision.action === 'confirm')
      })
      handle.window.once('closed', () => finish(false))
      // This timer only closes stale presentation. Main revalidates action state at the execution boundary.
      timerId = setClockInterval(() => {
        if (!isPending() || Date.now() >= view.expiresAt)
          finish(false)
      }, 100)
    })
  }

  async function present(actionId: string): Promise<boolean> {
    const action = params.actions.get(actionId)
    if (!action?.terminal || action.status !== 'pending')
      return false
    const request = params.actions.validateRequest(action.terminal.snapshot.requestId, action.attribution, { allowClosed: true })
    const view: TerminalApprovalView = { kind: 'terminal', actionId, expiresAt: action.expiresAt, serverName: action.terminal.serverName, snapshot: action.terminal.snapshot, submission: { sessionId: request.sessionId, turnId: request.turnId, text: request.text, senderWebContentsId: request.senderWebContentsId } }
    return await presentView(actionId, actionId, view, () => params.actions.get(actionId)?.status === 'pending')
  }

  async function confirm(request: ApprovalPrompt, signal?: AbortSignal): Promise<boolean> {
    const actionId = randomUUID()
    const view: TerminalApprovalView = {
      kind: 'confirmation',
      actionId,
      expiresAt: CONFIRMATION_EXPIRES_AT,
      ...request,
    }
    // NOTICE:
    // Each confirmation owns its window. A shared id made the second prompt reuse
    // the first window and replace its payload, so the first decision could never
    // match its action id and that approval waited until the window closed.
    return await presentView(`terminal-approval-confirmation-${actionId}`, actionId, view, () => Date.now() < view.expiresAt, signal)
  }
  return {
    present,
    confirm,
    restore: () => {
      for (const window of presentations) {
        if (window.isMinimized())
          window.restore()
        showWindow(window)
      }
    },
  }
}
