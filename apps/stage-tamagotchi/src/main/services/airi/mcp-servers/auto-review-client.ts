import type { WebContents } from 'electron'

import type { AutoApprovalReviewRequest, AutoApprovalReviewResult } from '../../../../shared/eventa/terminal-approval'

import { defineInvoke } from '@moeru/eventa'
import { BrowserWindow } from 'electron'

import * as v from 'valibot'

import { autoApprovalReview, autoApprovalReviewResultSchema } from '../../../../shared/eventa/terminal-approval'
import { createWindowContext } from '../../../libs/electron/window-context'

/**
 * Asks the current Runtime for one review stage.
 * A missing window or a failed call throws, so the caller can leave the cache unchanged.
 * Eventa forwards `signal` to the renderer handler as abortController.signal, and that handler stops generateText.
 */
export function reviewAutoApproval(getRuntime: () => WebContents | undefined) {
  return async (request: AutoApprovalReviewRequest, signal: AbortSignal): Promise<AutoApprovalReviewResult> => {
    const sender = getRuntime()
    const window = sender && !sender.isDestroyed() ? BrowserWindow.fromWebContents(sender) : null
    if (!window || window.isDestroyed())
      throw new Error('Auto review window is not available.')
    const { context, dispose } = createWindowContext(window)
    try {
      const result = await defineInvoke(context, autoApprovalReview)(request, { signal })
      return v.parse(autoApprovalReviewResultSchema, result)
    }
    finally {
      await dispose()
    }
  }
}
