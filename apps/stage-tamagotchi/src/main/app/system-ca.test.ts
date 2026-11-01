import { describe, expect, it, vi } from 'vitest'

const tlsMock = vi.hoisted(() => ({
  getCACertificates: vi.fn((type: string) => type === 'system' ? ['private-root', 'public-root'] : ['public-root', 'mozilla-root']),
  setDefaultCACertificates: vi.fn(),
}))

vi.mock('node:tls', () => ({ default: tlsMock }))

describe('trustSystemCACertificates', async () => {
  const { trustSystemCACertificates } = await import('./system-ca')

  it('adds the system certificates to the bundled ones', () => {
    trustSystemCACertificates()

    expect(tlsMock.setDefaultCACertificates).toHaveBeenCalledWith(['public-root', 'mozilla-root', 'private-root'])
  })
})
