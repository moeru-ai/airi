import type { AutoApprovalCard } from '../../../shared/eventa/terminal-approval'

import { describe, expect, it, vi } from 'vitest'

import { runAutoApprovalReview } from './auto-approval-review-run'

const card: AutoApprovalCard = { lane: 'terminal', cwd: '.', command: 'rm a', reviewClass: 'delete' }

describe('runAutoApprovalReview', () => {
  it('throws when consciousness is not configured', async () => {
    await expect(runAutoApprovalReview({
      request: { sessionId: 's', stage: 'fast', card },
      signal: new AbortController().signal,
      consciousnessConfigured: false,
      messages: [],
      generateText: vi.fn(),
    })).rejects.toThrow('configured consciousness model')
  })

  it('throws when the invoke signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('grant ended'))
    await expect(runAutoApprovalReview({
      request: { sessionId: 's', stage: 'fast', card },
      signal: controller.signal,
      consciousnessConfigured: true,
      messages: [],
      generateText: vi.fn(),
    })).rejects.toThrow('grant ended')
  })

  it('passes the abort signal into generateText', async () => {
    const generateText = vi.fn((_conversation, signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new Error('aborted'))
        return
      }
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    }))
    const controller = new AbortController()
    const pending = runAutoApprovalReview({
      request: { sessionId: 's', stage: 'fast', card },
      signal: controller.signal,
      consciousnessConfigured: true,
      messages: [{ role: 'user', content: 'Delete tmp.log' }],
      generateText,
    })
    controller.abort(new Error('grant ended'))
    await expect(pending).rejects.toThrow('grant ended')
    expect(generateText).toHaveBeenCalledWith(expect.anything(), controller.signal)
  })
})
