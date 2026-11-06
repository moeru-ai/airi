import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { WebContents } from 'electron'

import type { PendingActionManager } from './action-manager'

import { defineInvokeHandler } from '@moeru/eventa'

import { chatRequestCancel, chatRequestFinish, chatRequestRegister } from '../../../../shared/eventa/terminal-approval'
import { requireMainFrameSender } from '../../../libs/electron/window-context'

/** Captures normal pre-provider submissions from the Main-designated Runtime. Closing a source invalidates only its waiting actions. */
export function setupChatRequests(context: ReturnType<typeof createContext>['context'], actions: PendingActionManager, isRuntimeSender: (sender: WebContents) => boolean) {
  const observed = new WeakSet<WebContents>()
  defineInvokeHandler(context, chatRequestRegister, (input, options) => {
    const sender = requireMainFrameSender(options)
    if (!isRuntimeSender(sender))
      return {}
    if (!observed.has(sender)) {
      observed.add(sender)
      sender.once('destroyed', () => actions.cancelBySender(sender.id))
      sender.on('render-process-gone', () => actions.cancelBySender(sender.id))
      sender.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace)
          actions.cancelBySender(sender.id)
      })
    }
    return { requestId: actions.registerRequest(input, sender.id).id }
  })
  defineInvokeHandler(context, chatRequestFinish, (input, options) => {
    actions.finishRequest(input.requestId, requireMainFrameSender(options).id)
  })
  defineInvokeHandler(context, chatRequestCancel, (input, options) => {
    actions.cancelRequest(input.requestId, requireMainFrameSender(options).id)
  })
}
