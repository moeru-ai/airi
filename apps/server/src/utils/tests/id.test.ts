import { describe, expect, it } from 'vitest'

import { nanoid, NANOID_ALPHABET, NANOID_DEFAULT_SIZE } from '../id'

describe('nanoid', () => {
  it('generates default-size URL-safe identifiers', () => {
    const id = nanoid()

    expect(id).toHaveLength(NANOID_DEFAULT_SIZE)
    expect([...id].every(char => NANOID_ALPHABET.includes(char))).toBe(true)
  })

  it('honors caller-provided sizes including empty IDs', () => {
    expect(nanoid(0)).toBe('')

    const id = nanoid(8)
    expect(id).toHaveLength(8)
    expect([...id].every(char => NANOID_ALPHABET.includes(char))).toBe(true)
  })
})
