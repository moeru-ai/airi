import type { TerminalNotice } from '@proj-airi/stage-shared/terminal-approval'

import type { PendingActionManager } from '../computer-use/action-manager'

import { defineInvoke } from '@moeru/eventa'
import { BrowserWindow, webContents } from 'electron'

import { terminalOutcomeNotice } from '../../../../shared/eventa/terminal-approval'
import { createWindowContext } from '../../../libs/electron/window-context'

/** Sends one Host observation only to its original Runtime. A missing or cancelled owner never falls back to the active window. */
export async function deliverTerminalNotice(actions: PendingActionManager, notice: TerminalNotice) {
  const messageId = `terminal:${notice.actionId}`
  const action = actions.get(notice.actionId)
  if (!action?.terminal || action.terminal.snapshot.requestId !== notice.requestId
    || action.attribution.sessionId !== notice.sessionId || action.attribution.turnId !== notice.turnId
    || action.attribution.toolCallId !== notice.toolCallId || action.terminal.snapshot.command !== notice.command
    || action.terminal.snapshot.effectiveCwd !== notice.effectiveCwd) {
    throw new Error('The Terminal notice does not match its saved Host action.')
  }
  // Cancellation is recorded by Main, without starting an unsolicited replacement generation.
  if (notice.status === 'cancelled')
    return { status: 'suppressed' as const, sessionId: notice.sessionId, messageId }
  const request = actions.validateRequest(notice.requestId, action.attribution, { allowClosed: true })
  const sender = webContents.fromId(request.senderWebContentsId)
  const window = sender && !sender.isDestroyed() ? BrowserWindow.fromWebContents(sender) : null
  if (!window || window.isDestroyed())
    throw new Error('The original Terminal request Runtime is unavailable.')
  const { context, dispose } = createWindowContext(window)
  try {
    const signal = AbortSignal.any([actions.requestSignal(notice.requestId, action.attribution), AbortSignal.timeout(Math.max(1, request.expiresAt - Date.now()))])
    const receipt = await defineInvoke(context, terminalOutcomeNotice)(notice, { signal })
    if (receipt.sessionId !== notice.sessionId || receipt.messageId !== messageId)
      throw new Error('The Terminal notice receipt does not match its original Session and message.')
    return receipt
  }
  finally {
    await dispose()
  }
}
