import type { ElectronAuthStatus } from '../../shared/eventa'

import { createContext, defineInvokeHandler } from '@moeru/eventa'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { electronAuthCallback, electronAuthComplete, electronAuthGetStatus, electronAuthStatus } from '../../shared/eventa'
import { useAuthStatusStore } from '../stores/auth-status'
import { initializeElectronAuthCallbackBridge } from './electron-auth-callback'

const boundary = vi.hoisted(() => ({
  context: undefined as ReturnType<typeof createContext<unknown, { raw?: unknown }>> | undefined,
  session: vi.fn(),
}))
vi.mock('@proj-airi/electron-vueuse', () => ({ getElectronEventaContext: () => boundary.context }))
vi.mock('@proj-airi/stage-ui/libs/auth-client', async importOriginal => ({
  ...await importOriginal<typeof import('@proj-airi/stage-ui/libs/auth-client')>(),
  requestAuthSession: boundary.session,
}))

let pinia: ReturnType<typeof createPinia>
let reports: Array<Pick<ElectronAuthStatus, 'attemptId' | 'error'>>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  reports = []
  boundary.context = createContext<unknown, { raw?: unknown }>()
  boundary.session.mockReset()
  defineInvokeHandler(boundary.context, electronAuthGetStatus, () => undefined)
  defineInvokeHandler(boundary.context, electronAuthComplete, (report) => {
    reports.push(report)
  })
})
afterEach(() => {
  disposePinia(pinia)
  localStorage.clear()
})

const tokens = { attemptId: 'attempt-1', accessToken: 'test-token', refreshToken: 'test-refresh', expiresIn: 3600 }

describe('electron auth callback bridge', () => {
  it('reports success only after the exchanged token establishes a real session', async () => {
    const date = new Date()
    boundary.session.mockResolvedValue({
      user: { id: 'user-1', name: 'Test user', email: 'user@example.test', emailVerified: true, createdAt: date, updatedAt: date },
      session: { id: 'session-1', userId: 'user-1', token: 'session-token', expiresAt: date, createdAt: date, updatedAt: date },
    })
    initializeElectronAuthCallbackBridge()
    boundary.context!.emit(electronAuthCallback, tokens)
    await expect.poll(() => reports).toEqual([{ attemptId: 'attempt-1', error: undefined }])
    expect(boundary.session).toHaveBeenCalledWith('test-token')
    expect(useAuthStore().isAuthenticated).toBe(true)
  })

  it('reports an error when token exchange succeeds but session confirmation returns false', async () => {
    // ROOT CAUSE:
    // completeSignIn returns false on a missing session. The callback bridge
    // previously ignored that result and had no visible completion feedback.
    boundary.session.mockResolvedValue(null)
    initializeElectronAuthCallbackBridge()
    boundary.context!.emit(electronAuthCallback, tokens)
    await expect.poll(() => reports[0]?.error).toContain('Could not confirm')
    expect(useAuthStore().isAuthenticated).toBe(false)
  })

  it('receives credential-free feedback from another window without changing auth state', () => {
    initializeElectronAuthCallbackBridge()
    boundary.context!.emit(electronAuthStatus, { attemptId: 'another-window', state: 'waiting' })
    expect(useAuthStatusStore().status).toEqual({ attemptId: 'another-window', state: 'waiting' })
    expect(useAuthStore().isAuthenticated).toBe(false)
  })
})
