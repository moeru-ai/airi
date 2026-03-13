import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { dialog } from 'electron'

import { electronPromptDesktopAutomationApproval } from '../../../../shared/eventa'

export function createDesktopAutomationApprovalService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electronPromptDesktopAutomationApproval, async (payload) => {
    // TODO: ask frontend side to localize this with i18n locales.
    const scopeNote = payload?.sessionScoped
      ? 'Approving this also covers terminal/app-open actions for the current AIRI run.'
      : 'This approval applies to this action only.'

    const actionSummary = payload?.summary?.trim() || `${payload?.actionKind || 'desktop action'} requested by AIRI`
    const detailLines = [
      `Tool: ${payload?.toolName || 'unknown'}`,
      payload?.pendingActionId ? `Pending Action ID: ${payload.pendingActionId}` : undefined,
      payload?.actionKind ? `Action: ${payload.actionKind}` : undefined,
      scopeNote,
    ].filter(Boolean)

    // TODO: we should use our `notice` window to implement such thing.
    const { response } = await dialog.showMessageBox(params.window, {
      type: 'warning',
      // TODO: ask frontend side to localize this with i18n locales.
      buttons: ['Approve', 'Reject'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Approve AIRI Desktop Automation',
      message: actionSummary,
      detail: detailLines.join('\n'),
      normalizeAccessKeys: true,
    })

    return {
      approved: response === 0,
    }
  })
}
