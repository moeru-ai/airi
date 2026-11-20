import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { WebContents } from 'electron'

import type { ApprovalPrompt } from '../../../../shared/eventa/terminal-approval'
import type { I18n } from '../../../libs/i18n'
import type { PendingActionManager } from './action-manager'
import type { InvocationAttribution } from './attribution'

import { defineInvokeHandler } from '@moeru/eventa'
import { chatRequestSchema } from '@proj-airi/stage-shared/chat-request'
import { BrowserWindow } from 'electron'

import * as v from 'valibot'

import { approvalGrantModeSchema, chatRequestCancel, chatRequestFinish, chatRequestRegister, sessionApprovalGrant, turboLaneSchema } from '../../../../shared/eventa/terminal-approval'
import { requireMainFrameSender } from '../../../libs/electron/window-context'
import { isAutoGrantForegroundDenied } from './auto-policy'

const sessionGrantSchema = v.strictObject({
  sessionId: chatRequestSchema.entries.sessionId,
  lane: turboLaneSchema,
  mode: v.optional(approvalGrantModeSchema),
})

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
  presentConfirmation: (request: ApprovalPrompt, signal?: AbortSignal) => Promise<boolean>
  readCommandWorkspace?: () => Promise<string | undefined>
  readForegroundApp?: () => Promise<{ appName: string, windowTitle?: string } | undefined>
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
  defineInvokeHandler(context, sessionApprovalGrant, async (input, options) => {
    const sender = requireMainFrameSender(options)
    const window = BrowserWindow.fromWebContents(sender)
    const runtime = sources.getRuntime()
    if (!runtime || runtime.isDestroyed() || !window || !sources.isChatWindow(window))
      return false
    const { sessionId, lane, mode } = v.parse(sessionGrantSchema, input)
    const key = `${runtime.id}:${sessionId}:${lane}`
    const currentGrant = () => actions.grantMode(lane, sessionId, runtime.id)

    if (mode === undefined)
      return currentGrant()

    if (mode === 'ask') {
      turboDialogs.get(key)?.abort()
      actions.setGrant(lane, sessionId, runtime.id, 'ask')
      return 'ask'
    }

    if (currentGrant() === mode)
      return mode

    let workspaceRoot: string | undefined
    let frozenAppName: string | undefined
    if (mode === 'auto' && lane === 'terminal') {
      workspaceRoot = await sources.readCommandWorkspace?.()
      if (!workspaceRoot)
        return currentGrant()
    }
    if (mode === 'auto' && lane === 'computer_use') {
      const foreground = await sources.readForegroundApp?.()
      const appName = foreground?.appName.trim() ?? ''
      if (!appName || isAutoGrantForegroundDenied(appName, foreground?.windowTitle))
        return currentGrant()
      frozenAppName = appName
    }

    turboDialogs.get(key)?.abort()
    const confirmation = new AbortController()
    turboDialogs.set(key, confirmation)
    const signal = AbortSignal.any([documentSignal(sender), documentSignal(runtime), confirmation.signal, ...(options?.abortController ? [options.abortController.signal] : [])])
    const { t } = sources.i18n
    const confirmPrefix = lane === 'terminal' ? 'approval-command' : 'approval-computer-use'
    const modeName = mode === 'auto' ? 'auto' : 'full'
    try {
      const approved = await sources.presentConfirmation({
        title: t(`tamagotchi.stage.chat-window.computer-tools.${confirmPrefix}-${modeName}-confirm`),
        detail: mode === 'auto' && lane === 'terminal'
          ? t(`tamagotchi.stage.chat-window.computer-tools.${confirmPrefix}-auto-scope`, { workspace: workspaceRoot ?? '' })
          : mode === 'auto' && lane === 'computer_use'
            ? t(`tamagotchi.stage.chat-window.computer-tools.${confirmPrefix}-auto-scope`, { app: frozenAppName ?? '' })
            : t(`tamagotchi.stage.chat-window.computer-tools.${confirmPrefix}-${modeName}-scope`),
        cancelLabel: t('tamagotchi.stage.chat-window.computer-tools.cancel'),
        allowLabel: t(`tamagotchi.stage.chat-window.computer-tools.${confirmPrefix}-${modeName}-allow`),
        sessionId,
      }, signal)
      if (!approved || signal.aborted || runtime !== sources.getRuntime() || !sources.isChatWindow(window))
        return currentGrant()
      actions.setGrant(lane, sessionId, runtime.id, mode, {
        ...(workspaceRoot ? { workspaceRoot } : {}),
        ...(frozenAppName ? { frozenAppName } : {}),
      })
      return mode
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
      approved = await sources.presentConfirmation({
        title: t('tamagotchi.stage.chat-window.computer-tools.computer-use-confirm'),
        detail: [
          t('tamagotchi.stage.chat-window.computer-tools.computer-use-scope'),
          request.summary,
        ].filter(Boolean).join('\n\n'),
        cancelLabel: t('tamagotchi.stage.chat-window.computer-tools.cancel'),
        allowLabel: t('tamagotchi.stage.chat-window.computer-tools.computer-use-allow'),
        sessionId: request.attribution.sessionId,
        turnId: request.attribution.turnId,
        toolCallId: request.attribution.toolCallId,
        serverName: request.serverName,
        toolName: request.toolName,
      }, approvalSignal)
    }
    catch (error) {
      if (approvalSignal.aborted)
        return false
      throw error
    }

    return approved && !approvalSignal.aborted && runtime === sources.getRuntime() && !window.isDestroyed()
  }
  defineInvokeHandler(context, chatRequestFinish, (input, options) => {
    actions.finishRequest(input.requestId, requireMainFrameSender(options).id)
  })
  defineInvokeHandler(context, chatRequestCancel, (input, options) => {
    actions.cancelRequest(input.requestId, requireMainFrameSender(options).id)
  })

  return { presentComputerUse }
}
