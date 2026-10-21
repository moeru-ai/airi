import { describe, expect, it } from 'vitest'

import { compoundNames as ja } from './names-ja'
import { compoundNames as ko } from './names-ko'
import { compoundNames as zh } from './names-zh'

describe('compoundNames', () => {
  it('names the same formulas in every language', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(zh).sort())
    expect(Object.keys(ko).sort()).toEqual(Object.keys(zh).sort())
  })
})
