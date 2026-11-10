import { MathSpeech } from '@proj-airi/speech-transformer-math'
import { describe, expect, it } from 'vitest'

import { chemistry } from '..'

const speech = new MathSpeech({ extensions: [chemistry()] })

describe('speakMath', () => {
  it.each([
    [String.raw`\ce{2H2 + O2 -> 2H2O}`, '氢气 和 氧气 反应生成 水'],
    [String.raw`\ce{N2 + 3H2 <=> 2NH3}`, '氮气 和 氢气 可逆反应生成 氨气'],
    [String.raw`\ce{Fe^{3+}}`, 'Fe 3价正离子'],
    [String.raw`\ce{CaCO3 ->[\Delta] CaO + CO2 ^}`, '在加热条件下 碳酸钙 分解生成 氧化钙 和 二氧化碳气体'],
  ])('reads the chemistry %s', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it.each([
    [String.raw`\ce{Ca(OH)2 + CO2 -> CaCO3 + H2O}`, '氢氧化钙 和 二氧化碳 反应生成 碳酸钙 和 水'],
  ])('reads the chemistry %s symbol by symbol where it has no name', (tex, expected) => {
    expect(speech.speak(tex, 'zh')).toBe(expected)
  })
})

describe('chemistry readings', () => {
  it('reads the names of species in an equation', () => {
    expect(speech.speak(String.raw`\ce{Ca(OH)2 + CO2 -> CaCO3 + H2O}`, 'zh')).toBe('氢氧化钙 和 二氧化碳 反应生成 碳酸钙 和 水')
  })

  it('reads school compounds of an equation by their names', () => {
    expect(speech.speak(String.raw`\ce{2KMnO4 -> K2MnO4 + MnO2 + O2}`, 'zh')).toBe('高锰酸钾 分解生成 锰酸钾、二氧化锰 和 氧气')
    expect(speech.speak(String.raw`\ce{CuSO4*5H2O -> CuSO4 + 5H2O}`, 'zh')).toBe('五水合硫酸铜 分解生成 硫酸铜 和 水')
  })
})

describe('chemistry of the review', () => {
  // The formula speech eval heard the name of a hydrate alone wrongly in every language, as 無水和物 for 五水和物, the
  // opposite meaning. Its symbols were heard right, so a hydrate alone keeps them.
  it('reads a hydrate alone by its symbols, because its name was heard wrongly', () => {
    expect(speech.speak(String.raw`\ce{CuSO4*5H2O}`, 'zh')).toBe('CuSO4 点 5 H2O')
  })

  it('reads one reactant that yields several products as a decomposition', () => {
    expect(speech.speak(String.raw`\ce{2KClO3 -> 2KCl + 3O2}`, 'zh')).toBe('氯酸钾 分解生成 氯化钾 和 氧气')
  })
})
