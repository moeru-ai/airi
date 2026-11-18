import { MathSpeech } from '@proj-airi/speech-transformer-math'
import { describe, expect, it } from 'vitest'

import { chemistry } from '..'

const speech = new MathSpeech({ extensions: [chemistry()] })

describe('speakMath', () => {
  it.each([
    [String.raw`\ce{2H2 + O2 -> 2H2O}`, '水素と酸素が反応して 水ができる'],
    [String.raw`\ce{N2 + 3H2 <=> 2NH3}`, '窒素と水素が可逆的に反応して アンモニアができる'],
    [String.raw`\ce{Fe^{3+}}`, 'エフ イー さん価の陽イオン'],
    [String.raw`\ce{CaCO3 ->[\Delta] CaO + CO2 ^}`, '加熱の条件で 炭酸カルシウムが分解して 酸化カルシウムと二酸化炭素気体ができる'],
  ])('reads the chemistry %s', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it.each([
    [String.raw`\ce{Ca(OH)2 + CO2 -> CaCO3 + H2O}`, '水酸化カルシウムと二酸化炭素が反応して 炭酸カルシウムと水ができる'],
  ])('reads the chemistry %s symbol by symbol where it has no name', (tex, expected) => {
    expect(speech.speak(tex, 'ja')).toBe(expected)
  })
})

describe('chemistry readings', () => {
  it('reads school compounds of an equation by their names', () => {
    expect(speech.speak(String.raw`\ce{Fe2O3 + 3CO -> 2Fe + 3CO2}`, 'ja')).toContain('酸化第二鉄')
  })
})

describe('chemistry of the review', () => {
  // The formula speech eval heard the name of a hydrate alone wrongly in every language, as 無水和物 for 五水和物, the
  // opposite meaning. Its symbols were heard right, so a hydrate alone keeps them.
  it('reads a hydrate alone by its symbols, because its name was heard wrongly', () => {
    expect(speech.speak(String.raw`\ce{CuSO4*5H2O}`, 'ja')).toBe('シー ユー エス オー よん ドット ごエイチ に オー')
  })

  it('reads one reactant that yields several products as a decomposition', () => {
    expect(speech.speak(String.raw`\ce{2KClO3 -> 2KCl + 3O2}`, 'ja')).toBe('塩素酸カリウムが分解して 塩化カリウムと酸素ができる')
  })
})

describe('mappings of the review', () => {
  it('names a charge with a word, because a voice reads (III) as letters', () => {
    expect(speech.speak(String.raw`\ce{Fe^3+ + 3OH- -> Fe(OH)3 v}`, 'ja')).toBe('三価の鉄イオンと水酸化物イオンが反応して 水酸化第二鉄沈殿ができる')
  })
})
