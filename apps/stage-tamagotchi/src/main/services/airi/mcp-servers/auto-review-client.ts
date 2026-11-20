import type { WebContents } from 'electron'

import type { AutoApprovalCard } from '../../../../shared/eventa/terminal-approval'

import { defineInvoke } from '@moeru/eventa'
import { BrowserWindow } from 'electron'

import { autoApprovalReview } from '../../../../shared/eventa/terminal-approval'
import { createWindowContext } from '../../../libs/electron/window-context'
import { AUTO_REVIEW_TIMEOUT_MS } from '../computer-use/auto-review'

/**
 * Asks the current Runtime for one short review. A missing window, a failed call, or a bad reply is a refusal.
 */
export function reviewAutoApproval(getRuntime: () => WebContents | undefined) {
  return async (card: AutoApprovalCard, signal: AbortSignal): Promise<'allow' | 'refuse'> => {
    const sender = getRuntime()
    const window = sender && !sender.isDestroyed() ? BrowserWindow.fromWebContents(sender) : null
    if (!window || window.isDestroyed())
      return 'refuse'
    const { context, dispose } = createWindowContext(window)
    try {
      const result = await defineInvoke(context, autoApprovalReview)(card, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(AUTO_REVIEW_TIMEOUT_MS)]),
      })
      return result.decision === 'allow' ? 'allow' : 'refuse'
    }
    catch {
      return 'refuse'
    }
    finally {
      await dispose()
    }
  }
}
