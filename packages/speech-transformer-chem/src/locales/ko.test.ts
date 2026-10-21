import { MathSpeech } from '@proj-airi/speech-transformer-math'
import { describe, expect, it } from 'vitest'

import { chemistry } from '..'

const speech = new MathSpeech({ extensions: [chemistry()] })

describe('speakMath', () => {
  it.each([
    [String.raw`\ce{2H2 + O2 -> 2H2O}`, '수소와 산소가 반응하여 물이 생성된다'],
    [String.raw`\ce{N2 + 3H2 <=> 2NH3}`, '질소와 수소가 가역적으로 반응하여 암모니아가 생성된다'],
    [String.raw`\ce{Fe^{3+}}`, '에프 E 삼가 양이온'],
    [String.raw`\ce{CaCO3 ->[\Delta] CaO + CO2 ^}`, '가열 조건에서 탄산 칼슘이 분해되어 산화 칼슘과 이산화 탄소 기체가 생성된다'],
  ])('reads the chemistry %s', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })
})

// The cases below come from the formula speech eval, where a StepFun voice read the rule output.
// Each one failed to reach the listener before, because the text left a choice to the voice or to the listener.
describe('speakMath readings that a voice cannot get wrong', () => {
  it.each([
    [String.raw`\ce{Ca(OH)2 + CO2 -> CaCO3 + H2O}`, '수산화 칼슘과 이산화 탄소가 반응하여 탄산 칼슘과 물이 생성된다'],
  ])('reads the chemistry %s symbol by symbol where it has no name', (tex, expected) => {
    expect(speech.speak(tex, 'ko')).toBe(expected)
  })
})

describe('chemistry of the review', () => {
  // The formula speech eval heard the name of a hydrate alone wrongly in every language, as 無水和物 for 五水和物, the
  // opposite meaning. Its symbols were heard right, so a hydrate alone keeps them.
  it('reads a hydrate alone by its symbols, because its name was heard wrongly', () => {
    expect(speech.speak(String.raw`\ce{CuSO4*5H2O}`, 'ko')).toBe('씨 유 에스 오 사 점 오 에이치 이 오')
  })

  it('reads one reactant that yields several products as a decomposition', () => {
    expect(speech.speak(String.raw`\ce{2KClO3 -> 2KCl + 3O2}`, 'ko')).toBe('염소산 칼륨이 분해되어 염화 칼륨과 산소가 생성된다')
  })
})
