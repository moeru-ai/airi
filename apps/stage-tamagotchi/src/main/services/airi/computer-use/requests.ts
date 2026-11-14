import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { WebContents } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { PendingActionManager } from './action-manager'

import { platform } from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'
import { chatRequestSchema } from '@proj-airi/stage-shared/chat-request'
import { terminalTurboCommands } from '@proj-airi/stage-shared/terminal-approval'
import { BrowserWindow, dialog } from 'electron'

import * as v from 'valibot'

import { chatRequestCancel, chatRequestFinish, chatRequestRegister, terminalTurboConfirm } from '../../../../shared/eventa/terminal-approval'
import { requireMainFrameSender } from '../../../libs/electron/window-context'

/** Captures normal pre-provider submissions from the Main-designated Runtime. Closing a source invalidates only its waiting actions. */
export function setupChatRequests(context: ReturnType<typeof createContext>['context'], actions: PendingActionManager, sources: {
  getRuntime: () => WebContents | undefined
  isChatWindow: (window: BrowserWindow) => boolean
  i18n: I18n
}) {
  const documents = new WeakMap<WebContents, AbortController>()

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
  defineInvokeHandler(context, terminalTurboConfirm, async (input, options) => {
    const sender = requireMainFrameSender(options)
    const window = BrowserWindow.fromWebContents(sender)
    const runtime = sources.getRuntime()
    if (platform !== 'win32' || !runtime || runtime.isDestroyed() || !window || !sources.isChatWindow(window))
      return false
    const submitted = v.parse(chatRequestSchema, input)
    const signal = AbortSignal.any([documentSignal(sender), documentSignal(runtime), ...(options?.abortController ? [options.abortController.signal] : [])])
    const { t } = sources.i18n
    const response = await dialog.showMessageBox(window, {
      type: 'question',
      message: t('tamagotchi.stage.chat-window.computer-tools.turbo-confirm'),
      detail: `${t('tamagotchi.stage.chat-window.computer-tools.turbo-scope')}\n\n${terminalTurboCommands.join('\n')}`,
      buttons: [
        t('tamagotchi.stage.chat-window.computer-tools.cancel'),
        t('tamagotchi.stage.chat-window.computer-tools.turbo-allow'),
      ],
      defaultId: 0,
      cancelId: 0,
      signal,
    })
    if (response.response !== 1 || signal.aborted || runtime !== sources.getRuntime() || !sources.isChatWindow(window))
      return false
    actions.registerRequest(submitted, runtime.id, true)
    return true
  })
  defineInvokeHandler(context, chatRequestFinish, (input, options) => {
    actions.finishRequest(input.requestId, requireMainFrameSender(options).id)
  })
  defineInvokeHandler(context, chatRequestCancel, (input, options) => {
    actions.cancelRequest(input.requestId, requireMainFrameSender(options).id)
  })
}
