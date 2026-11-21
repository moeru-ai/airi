import type { WebContents } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { autoApprovalReview } from '../../../../shared/eventa/terminal-approval'
import { createWindowIpc } from '../../../libs/electron/testing/window-ipc'
import { reviewAutoApproval } from './auto-review-client'

const electron = vi.hoisted(() => ({ fromWebContents: vi.fn() }))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: { fromWebContents: electron.fromWebContents },
  }
})

const card = { lane: 'terminal' as const, cwd: '.', command: 'rm a', reviewClass: 'delete' as const }

describe('reviewAutoApproval', () => {
  beforeEach(async () => {
    const { ipcMain } = await import('electron')
    ipcMain.removeAllListeners()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const { ipcMain } = await import('electron')
    ipcMain.removeAllListeners()
  })

  it('throws when the runtime window is missing', async () => {
    const review = reviewAutoApproval(() => undefined)
    await expect(review({ sessionId: 's', stage: 'fast', card }, new AbortController().signal))
      .rejects
      .toThrow('Auto review window is not available.')
  })

  it('throws when the runtime window is destroyed', async () => {
    electron.fromWebContents.mockReturnValue({ isDestroyed: () => true })
    const sender = { isDestroyed: () => false } as WebContents
    const review = reviewAutoApproval(() => sender)
    await expect(review({ sessionId: 's', stage: 'fast', card }, new AbortController().signal))
      .rejects
      .toThrow('Auto review window is not available.')
  })

  it('forwards abort to the renderer handler', async () => {
    const { ipcMain } = await import('electron')
    const runtime = createWindowIpc(ipcMain)
    electron.fromWebContents.mockReturnValue(runtime.window)
    defineInvokeHandler(runtime.context, autoApprovalReview, async (_input, options) => {
      const signal = options?.abortController?.signal
      await new Promise<void>((_resolve, reject) => {
        if (!signal)
          return reject(new Error('missing signal'))
        if (signal.aborted) {
          reject(signal.reason ?? new Error('aborted'))
          return
        }
        signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
      })
      return { decision: 'allow', reasonCode: 'model_allow', hasUserTranscript: true }
    })
    const review = reviewAutoApproval(() => runtime.window.webContents)
    const controller = new AbortController()
    const pending = review({ sessionId: 's', stage: 'fast', card }, controller.signal)
    controller.abort(new Error('grant ended'))
    await expect(pending).rejects.toThrow('grant ended')
  })
})
