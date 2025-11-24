import type { BrowserWindow } from 'electron'

import type { RequestWindowActionDefault } from '../../../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { noticeWindowEventa } from '../../../../shared/eventa'
import { createWindowService } from '../../../services/electron'

export function setupNoticeWindowInvokes(params: {
  window: BrowserWindow
  onAction: (payload: { id?: string, action: RequestWindowActionDefault }) => void
  onPageMounted: () => { id: string, type?: string, payload?: Record<string, any> } | undefined
  onPageUnmounted: () => void
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  createWindowService({ context, window: params.window })

  defineInvokeHandler(context, noticeWindowEventa.windowAction, (payload) => {
    params.onAction({ id: payload?.id, action: payload?.action ?? 'close' })
  })
  defineInvokeHandler(context, noticeWindowEventa.pageMounted, () => params.onPageMounted())
  defineInvokeHandler(context, noticeWindowEventa.pageUnmounted, () => params.onPageUnmounted())

  return { context }
}
