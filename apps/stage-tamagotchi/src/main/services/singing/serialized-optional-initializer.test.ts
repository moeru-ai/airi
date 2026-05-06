import { describe, expect, it, vi } from 'vitest'

import { createSerializedOptionalInitializer } from './serialized-optional-initializer'

describe('createSerializedOptionalInitializer', () => {
  it('serializes concurrent initialization into a single factory call', async () => {
    let resolveFactory!: (value: { ok: true }) => void
    const factory = vi.fn(() => new Promise<{ ok: true }>((resolve) => {
      resolveFactory = resolve
    }))

    const ensure = createSerializedOptionalInitializer(factory)
    const first = ensure()
    const second = ensure()

    expect(factory).toHaveBeenCalledTimes(1)

    resolveFactory({ ok: true })

    await expect(first).resolves.toEqual({ ok: true })
    await expect(second).resolves.toEqual({ ok: true })
    await expect(ensure()).resolves.toEqual({ ok: true })
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('retries after a null initialization result', async () => {
    const factory = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ok: true })

    const ensure = createSerializedOptionalInitializer(factory)

    await expect(ensure()).resolves.toBeNull()
    await expect(ensure()).resolves.toEqual({ ok: true })
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
