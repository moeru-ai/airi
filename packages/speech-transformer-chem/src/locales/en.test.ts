import { MathSpeech } from '@proj-airi/speech-transformer-math'
import { describe, expect, it } from 'vitest'

import { chemistry } from '..'

const speech = new MathSpeech({ extensions: [chemistry()] })

describe('speakMath', () => {
  it.each([
    [String.raw`\ce{2H2 + O2 -> 2H2O}`, 'two H two plus O two yields two H two O'],
    [String.raw`\ce{N2 + 3H2 <=> 2NH3}`, 'N two plus three H two is in equilibrium with two N H three'],
    [String.raw`\ce{Fe^{3+}}`, 'F E three plus'],
    [String.raw`\ce{CaCO3 ->[\Delta] CaO + CO2 ^}`, 'with heat C A C O three yields C A O plus C O two gas'],
  ])('reads the chemistry %s', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it.each([
    [String.raw`\ce{Ca(OH)2 + CO2 -> CaCO3 + H2O}`, 'C A open parenthesis O H close parenthesis two plus C O two yields C A C O three plus H two O'],
    [String.raw`\ce{CuSO4*5H2O}`, 'C U S O four dot five H two O'],
  ])('reads the chemistry %s symbol by symbol where it has no name', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })
})

describe('chemistry readings', () => {
  it.each([
    [String.raw`\ce{AgNO3 + NaCl -> AgCl v + NaNO3}`, 'A G N O three plus N A C L yields A G C L precipitate plus N A N O three'],
    [String.raw`\ce{SO4^2-}`, 'S O four two minus'],
    [String.raw`\ce{H2O(l)}`, 'H two O'],
  ])('reads %s in English', (tex, expected) => {
    expect(speech.speak(tex, 'en')).toBe(expected)
  })
})

describe('mappings of the review', () => {
  it('ends an ion of an equation with the word ion, so its plus is not the plus between species', () => {
    expect(speech.speak(String.raw`\ce{Fe^3+ + 3OH- -> Fe(OH)3 v}`, 'en')).toBe('F E three plus ion plus three O H minus ion yields F E open parenthesis O H close parenthesis three precipitate')
  })
})
