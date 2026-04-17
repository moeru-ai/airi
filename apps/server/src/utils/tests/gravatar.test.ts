import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { gravatarUrl } from '../gravatar'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

describe('gravatarUrl', () => {
  /**
   * @example
   *   gravatarUrl('user@example.com')
   *   // → 'https://www.gravatar.com/avatar/<sha256>?s=256&d=identicon'
   */
  it('returns a deterministic URL for the same email', () => {
    expect(gravatarUrl('user@example.com')).toBe(gravatarUrl('user@example.com'))
  })

  /**
   * @example
   *   gravatarUrl('  Alice@Example.com  ') === gravatarUrl('alice@example.com')
   */
  it('normalizes the email by trimming and lowercasing before hashing', () => {
    expect(gravatarUrl('  Alice@Example.com  ')).toBe(gravatarUrl('alice@example.com'))
  })

  it('uses SHA-256 of the normalized email as the path segment', () => {
    const url = gravatarUrl('user@example.com')
    expect(url).toContain(sha256Hex('user@example.com'))
  })

  it('defaults size to 256 and default image to identicon', () => {
    const url = gravatarUrl('user@example.com')
    expect(url).toContain('s=256')
    expect(url).toContain('d=identicon')
  })

  it('respects custom size and default image options', () => {
    const url = gravatarUrl('user@example.com', { size: 128, defaultImage: 'retro' })
    expect(url).toContain('s=128')
    expect(url).toContain('d=retro')
  })

  it('encodes URL default image when an absolute URL is provided', () => {
    const url = gravatarUrl('user@example.com', { defaultImage: 'https://cdn.example.com/fallback.png' })
    expect(url).toContain(`d=${encodeURIComponent('https://cdn.example.com/fallback.png')}`)
  })
})
