// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useFeatureFlagsStore } from './feature-flags'

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(async () => new Response(JSON.stringify({ flags: [] }), { status: 200 })),
}))

vi.mock('../composables/cloud', () => ({ useCloudFetch: () => mocks.cloudFetch }))
vi.mock('./auth', () => ({ useAuthStore: () => reactive({ sessionVersion: 0, user: undefined, token: undefined }) }))

describe('useFeatureFlagsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.cloudFetch.mockClear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('asks AIRI Cloud for the feature policy in a normal build', async () => {
    useFeatureFlagsStore()
    await vi.waitFor(() => expect(mocks.cloudFetch).toHaveBeenCalledWith('/v1/feature-flags', expect.anything()))
  })

  it('never calls AIRI Cloud in an offline build', async () => {
    vi.stubEnv('VITE_AIRI_OFFLINE', 'true')
    const store = useFeatureFlagsStore()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mocks.cloudFetch).not.toHaveBeenCalled()
    expect(store.loading).toBe(false)
  })
})
