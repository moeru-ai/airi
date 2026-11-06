import { describe, expect, it } from 'vitest'

import { resolveCheckoutRedirectBase } from './origin'

describe('resolveCheckoutRedirectBase', () => {
  const fallback = 'https://airi.moeru.ai'

  it('returns a trusted request origin', () => {
    const request = new Request('https://api.airi.build/checkout', { headers: { origin: 'http://localhost:5173' } })

    expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe('http://localhost:5173')
  })

  it('falls back when the Origin header carries a path that ends with a trusted host suffix', () => {
    const request = new Request('https://api.airi.build/checkout', { headers: { origin: 'https://evil.example/x.moeru-ai.workers.dev' } })

    expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe(fallback)
  })
})
