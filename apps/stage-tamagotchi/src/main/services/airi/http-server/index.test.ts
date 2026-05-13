import { describe, expect, it, vi } from 'vitest'

import { setupBuiltInServer } from './index'

describe('setupBuiltInServer', () => {
  it('starts registered adapters', async () => {
    const auth = { key: 'auth', start: vi.fn(async () => {}), stop: vi.fn(async () => {}) }
    const assets = { key: 'assets', start: vi.fn(async () => {}), stop: vi.fn(async () => {}) }

    const service = setupBuiltInServer({
      authServer: auth,
      staticAssetServer: assets,
    })

    await service.start()

    expect(auth.start).toHaveBeenCalledOnce()
    expect(assets.start).toHaveBeenCalledOnce()
  })
})
