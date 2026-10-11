import { describe, expect, it, vi } from 'vitest'

import { checkEmail } from './email-password'

describe('email discovery', () => {
  // Discovery previously discarded the verification flag before the page could select a route.
  it.each([true, false])('preserves verification status %s for navigation', async (emailVerified) => {
    const result = { exists: true, hasPassword: true, emailVerified }
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(result))
    await expect(checkEmail({ apiServerUrl: 'https://api.example.test', email: 'user@example.test', fetchImpl })).resolves.toEqual(result)
  })

  it('keeps absent verification status unknown during independent deployments', async () => {
    const result = { exists: true, hasPassword: true }
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(result))
    await expect(checkEmail({ apiServerUrl: 'https://api.example.test', email: 'user@example.test', fetchImpl })).resolves.toEqual(result)
  })

  it('rejects an invalid verification flag instead of treating it as verified', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ exists: true, hasPassword: true, emailVerified: 'false' }))
    await expect(checkEmail({ apiServerUrl: 'https://api.example.test', email: 'user@example.test', fetchImpl })).rejects.toThrow()
  })
})
