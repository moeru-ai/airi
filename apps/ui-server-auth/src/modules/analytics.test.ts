import type { AnalyticsAdapter } from './analytics'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AnalyticsClient,
  loadAnalyticsAdapter,
  trackEmailChange,
  trackSignupFormCompleted,
} from './analytics'

const adapterMocks = {
  capture: vi.fn(),
  identify: vi.fn(),
} satisfies AnalyticsAdapter

describe('auth analytics', () => {
  beforeEach(() => {
    adapterMocks.capture.mockClear()
    adapterMocks.identify.mockClear()
  })

  // ROOT CAUSE:
  //
  // The auth SPA emitted `signup_completed` before it knew the Better Auth
  // user id, while the server emitted the same canonical event with that id.
  // PostHog therefore counted one email signup as two unrelated persons.
  //
  // The anonymous UI milestone must use its own name. The identified server
  // event remains the only canonical `signup_completed` business fact.
  it('keeps anonymous signup UI completion separate from the canonical server signup fact', async () => {
    await expect(loadAnalyticsAdapter(async () => adapterMocks)).resolves.toBe(true)

    trackSignupFormCompleted({ source: 'email', requires_verification: true })

    expect(adapterMocks.capture).toHaveBeenCalledWith(
      'signup_form_completed',
      { source: 'email', requires_verification: true },
      { beforeNavigation: false },
    )
  })

  it('flushes calls made while the optional adapter is loading', async () => {
    const client = new AnalyticsClient()
    let install: ((adapter: AnalyticsAdapter) => void) | undefined
    const loading = client.load(() => new Promise<AnalyticsAdapter>((resolve) => {
      install = resolve
    }))

    client.capture('login_started', { method: 'github' }, { beforeNavigation: true })
    client.identify('user-1')
    await Promise.resolve()
    install?.(adapterMocks)

    await expect(loading).resolves.toBe(true)
    expect(adapterMocks.capture).toHaveBeenCalledWith(
      'login_started',
      { method: 'github' },
      { beforeNavigation: true },
    )
    expect(adapterMocks.identify).toHaveBeenCalledWith('user-1')
  })

  it('becomes a harmless no-op when a content blocker rejects the adapter import', async () => {
    const client = new AnalyticsClient()
    const loading = client.load(async () => {
      throw new TypeError('Failed to fetch dynamically imported module')
    })

    client.capture('login_started', { method: 'google' })

    await expect(loading).resolves.toBe(false)
    expect(() => client.capture('login_failed', { method: 'google' })).not.toThrow()
    expect(adapterMocks.capture).not.toHaveBeenCalled()
  })

  it('captures only native email-change request results', async () => {
    await loadAnalyticsAdapter(async () => adapterMocks)

    trackEmailChange({ flow: 'standard', result: 'requested' })
    trackEmailChange({ flow: 'placeholder', result: 'failed' })

    expect(adapterMocks.capture.mock.calls).toEqual([
      ['email_change', { flow: 'standard', result: 'requested' }, undefined],
      ['email_change', { flow: 'placeholder', result: 'failed' }, undefined],
    ])
  })

  it('captures a processed callback without guessing its flow', async () => {
    await loadAnalyticsAdapter(async () => adapterMocks)

    trackEmailChange({ result: 'callback_processed' })

    expect(adapterMocks.capture).toHaveBeenCalledWith(
      'email_change',
      { result: 'callback_processed' },
      undefined,
    )
  })

  it('rebuilds the runtime whitelist without private caller fields', async () => {
    await loadAnalyticsAdapter(async () => adapterMocks)
    const pollutedRequest = {
      email: 'secret@example.com',
      flow: 'placeholder' as const,
      message: 'private server message',
      query: 'email_change=processed&error=TOKEN_EXPIRED',
      result: 'requested' as const,
      token: 'raw-token',
    }
    const pollutedCallback = {
      email: 'placeholder@steam.local',
      flow: 'placeholder' as const,
      message: 'private server message',
      query: 'email_change=processed',
      result: 'callback_processed' as const,
      token: 'raw-token',
    }

    trackEmailChange(pollutedRequest)
    trackEmailChange(pollutedCallback)

    expect(adapterMocks.capture).toHaveBeenNthCalledWith(1, 'email_change', {
      flow: 'placeholder',
      result: 'requested',
    }, undefined)
    expect(adapterMocks.capture).toHaveBeenNthCalledWith(2, 'email_change', {
      result: 'callback_processed',
    }, undefined)
    const captured = JSON.stringify(adapterMocks.capture.mock.calls)
    expect(captured).not.toContain('secret@example.com')
    expect(captured).not.toContain('.local')
    expect(captured).not.toContain('raw-token')
    expect(captured).not.toContain('email_change=processed')
    expect(captured).not.toContain('private server message')
  })
})
