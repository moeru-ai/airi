import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { PendingActionManager } from '../../services/airi/computer-use/action-manager'

import { defineInvokeHandler } from '@moeru/eventa'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { terminalApprovalWindow } from '../../../shared/eventa/terminal-approval'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { requireMainFrameSender } from '../../libs/electron/window-context'
import { createReferencedWindowManager } from '../shared/referenced-window'
import { customTitleBarWindowConfig, protectPrivilegedWindowNavigation } from '../shared/window'

/** Presents a saved action in a separate Main-owned source. The page owns no approval state or executable arguments. */
export function setupTerminalApprovalWindow(params: { actions: PendingActionManager, i18n: I18n, serverChannel: ServerChannel }) {
  const windows = createReferencedWindowManager({
    eventa: terminalApprovalWindow,
    i18n: params.i18n,
    serverChannel: params.serverChannel,
    createWindow: () => {
      const window = new BrowserWindow({
        title: 'Terminal approval',
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

  async function present(actionId: string): Promise<boolean> {
    const action = params.actions.get(actionId)
    if (!action?.terminal || action.status !== 'pending')
      return false
    const request = params.actions.validateRequest(action.terminal.snapshot.requestId, action.attribution, { allowClosed: true })
    const handle = await windows.open({
      id: actionId,
      route: '/terminal-approval',
      type: 'terminal-approval',
      payload: { actionId, expiresAt: action.expiresAt, serverName: action.terminal.serverName, snapshot: action.terminal.snapshot, submission: { sessionId: request.sessionId, turnId: request.turnId, text: request.text, senderWebContentsId: request.senderWebContentsId } },
    })
    return new Promise<boolean>((resolve) => {
      let finished = false
      let timer: ReturnType<typeof setInterval> | undefined
      const finish = (approved: boolean) => {
        if (finished)
          return
        finished = true
        clearInterval(timer)
        resolve(approved)
        safeClose(handle.window)
      }
      defineInvokeHandler(handle.context, terminalApprovalWindow.windowAction, (decision, options) => {
        if (requireMainFrameSender(options) !== handle.window.webContents || decision.id !== actionId)
          throw new Error('This approval decision does not belong to its Main-owned window.')
        finish(params.actions.get(actionId)?.status === 'pending' && decision.action === 'confirm')
      })
      handle.window.once('closed', () => finish(false))
      // This timer only closes stale presentation. Main revalidates TTL and cancellation at the execution boundary.
      timer = setInterval(() => {
        if (params.actions.get(actionId)?.status !== 'pending')
          finish(false)
      }, 100)
    })
  }
  return { present }
}
