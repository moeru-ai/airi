import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { WebContents } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { PendingActionManager } from './action-manager'
import type { InvocationAttribution } from './attribution'

import { defineInvokeHandler } from '@moeru/eventa'
import { chatRequestSchema } from '@proj-airi/stage-shared/chat-request'
import { BrowserWindow, dialog } from 'electron'

import * as v from 'valibot'

import { chatRequestCancel, chatRequestFinish, chatRequestRegister, terminalTurboMode } from '../../../../shared/eventa/terminal-approval'
import { requireMainFrameSender } from '../../../libs/electron/window-context'

const turboModeSchema = v.strictObject({ sessionId: chatRequestSchema.entries.sessionId, enabled: v.optional(v.boolean()) })

async function confirmAction(params: { window: BrowserWindow, message: string, detail: string, cancelLabel: string, allowLabel: string, signal: AbortSignal }) {
  const response = await dialog.showMessageBox(params.window, {
    type: 'question',
    message: params.message,
    detail: params.detail,
    buttons: [
      params.cancelLabel,
      params.allowLabel,
    ],
    defaultId: 0,
    cancelId: 0,
    signal: params.signal,
  })
  return response.response === 1 && !params.signal.aborted
}

export interface ComputerUseApprovalRequest {
  actionId: string
  requestId: string
  attribution: InvocationAttribution
  serverName: string
  toolName: string
  summary: string
}

/** Captures normal pre-provider submissions from the Main-designated Runtime. Closing a source invalidates only its waiting actions. */
export function setupChatRequests(context: ReturnType<typeof createContext>['context'], actions: PendingActionManager, sources: {
  getRuntime: () => WebContents | undefined
  isChatWindow: (window: BrowserWindow) => boolean
  i18n: I18n
}) {
  const documents = new WeakMap<WebContents, AbortController>()
  const turboDialogs = new Map<string, AbortController>()

  function documentSignal(sender: WebContents) {
    const observed = documents.get(sender)
    if (observed)
      return observed.signal
    const document = new AbortController()
    const senderId = sender.id
    documents.set(sender, document)
    const invalidate = () => {
      documents.get(sender)?.abort()
      documents.set(sender, new AbortController())
      actions.cancelBySender(senderId)
    }
    sender.once('destroyed', invalidate)
    sender.on('render-process-gone', invalidate)
    sender.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
      if (isMainFrame && !isSameDocument)
        invalidate()
    })
    return document.signal
  }

  defineInvokeHandler(context, chatRequestRegister, (input, options) => {
    const sender = requireMainFrameSender(options)
    if (sender !== sources.getRuntime())
      return {}
    documentSignal(sender)
    return { requestId: actions.registerRequest(input, sender.id).id }
  })
  defineInvokeHandler(context, terminalTurboMode, async (input, options) => {
    const sender = requireMainFrameSender(options)
    const window = BrowserWindow.fromWebContents(sender)
    const runtime = sources.getRuntime()
    if (!runtime || runtime.isDestroyed() || !window || !sources.isChatWindow(window))
      return false
    const { sessionId, enabled } = v.parse(turboModeSchema, input)
    const key = `${runtime.id}:${sessionId}`
    if (enabled === false) {
      turboDialogs.get(key)?.abort()
      actions.setTerminalTurbo(sessionId, runtime.id, false)
      return false
    }
    const active = !!actions.terminalTurboSignal(sessionId, runtime.id)
    if (enabled === undefined || active)
      return active

    turboDialogs.get(key)?.abort()
    const confirmation = new AbortController()
    turboDialogs.set(key, confirmation)
    const signal = AbortSignal.any([documentSignal(sender), documentSignal(runtime), confirmation.signal, ...(options?.abortController ? [options.abortController.signal] : [])])
    const { t } = sources.i18n
    try {
      const approved = await confirmAction({
        window,
        message: t('tamagotchi.stage.chat-window.computer-tools.turbo-confirm'),
        detail: t('tamagotchi.stage.chat-window.computer-tools.turbo-scope'),
        cancelLabel: t('tamagotchi.stage.chat-window.computer-tools.cancel'),
        allowLabel: t('tamagotchi.stage.chat-window.computer-tools.turbo-allow'),
        signal,
      })
      if (!approved || runtime !== sources.getRuntime() || !sources.isChatWindow(window))
        return false
      actions.setTerminalTurbo(sessionId, runtime.id, true)
      return true
    }
    finally {
      if (turboDialogs.get(key) === confirmation)
        turboDialogs.delete(key)
    }
  })
  async function presentComputerUse(request: ComputerUseApprovalRequest, signal?: AbortSignal) {
    const runtime = sources.getRuntime()
    const window = runtime ? BrowserWindow.fromWebContents(runtime) : undefined
    if (!runtime || runtime.isDestroyed() || !window || window.isDestroyed()
      || request.attribution.senderWebContentsId !== runtime.id) {
      return false
    }

    actions.validateRequest(request.requestId, request.attribution, { allowClosed: true })
    const requestSignal = actions.requestSignal(request.requestId, request.attribution)
    const approvalSignal = AbortSignal.any([requestSignal, documentSignal(runtime), ...(signal ? [signal] : [])])
    const { t } = sources.i18n
    let approved: boolean
    try {
      approved = await confirmAction({
        window,
        message: t('tamagotchi.stage.chat-window.computer-tools.computer-use-confirm'),
        detail: [
          t('tamagotchi.stage.chat-window.computer-tools.computer-use-scope'),
          request.summary,
        ].filter(Boolean).join('\n\n'),
        cancelLabel: t('tamagotchi.stage.chat-window.computer-tools.cancel'),
        allowLabel: t('tamagotchi.stage.chat-window.computer-tools.computer-use-allow'),
        signal: approvalSignal,
      })
    }
    catch (error) {
      if (approvalSignal.aborted)
        return false
      throw error
    }

    return approved && runtime === sources.getRuntime() && !window.isDestroyed()
  }
  defineInvokeHandler(context, chatRequestFinish, (input, options) => {
    actions.finishRequest(input.requestId, requireMainFrameSender(options).id)
  })
  defineInvokeHandler(context, chatRequestCancel, (input, options) => {
    actions.cancelRequest(input.requestId, requireMainFrameSender(options).id)
  })

  return { presentComputerUse }
}
