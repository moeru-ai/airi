import { describe, expect, it } from 'vitest'

import { buildGravatarUrl } from '../gravatar'

describe('buildGravatarUrl', () => {
  it('normalizes email casing and whitespace before hashing', () => {
    expect(buildGravatarUrl(' Hello@Example.COM ')).toBe(
      'https://www.gravatar.com/avatar/1753bdb368271a785887ddbfb926164f2f7c6a88f609c07ff0401c5572955206?d=identicon&s=200',
    )
  })

  it('returns null for empty email input', () => {
    expect(buildGravatarUrl('')).toBeNull()
    expect(buildGravatarUrl('   ')).toBeNull()
  })

  it('applies custom fallback and size options', () => {
    const url = buildGravatarUrl('person@example.com', {
      fallback: 'mp',
      size: 96,
    })

    expect(url).toBe(
      'https://www.gravatar.com/avatar/542d240129883c019e106e3b1b2d3f3cb3537c43c425364de8e951d5a3083345?d=mp&s=96',
    )
  })
})
