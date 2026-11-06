import { describe, expect, it } from 'vitest'

import { MathSpeech } from './speech'
import { speakUnit as speakUnitIn } from './units'

const speech = new MathSpeech()

function speakUnit(symbol: string, language: string): string | undefined {
  return speakUnitIn(symbol, speech.locale(language).units)
}

describe('speakUnit', () => {
  it.each([
    ['µm', 'micrometers', '微米', 'マイクロメートル', '마이크로미터'],
    ['nm', 'nanometers', '纳米', 'ナノメートル', '나노미터'],
    ['fs', 'femtoseconds', '飞秒', 'フェムト秒', '펨토초'],
    ['MHz', 'megahertz', '兆赫兹', 'メガヘルツ', '메가헤르츠'],
    ['kPa', 'kilopascals', '千帕斯卡', 'キロパスカル', '킬로파스칼'],
    ['dam', 'decameters', '十米', 'デカメートル', '데카미터'],
    ['cm^2', 'square centimeters', '平方厘米', '平方センチメートル', '제곱센티미터'],
    ['m3', 'cubic meters', '立方米', '立方メートル', '세제곱미터'],
  ])('reads %s with its prefix', (symbol, en, zh, ja, ko) => {
    expect(speakUnit(symbol, 'en')).toBe(en)
    expect(speakUnit(symbol, 'zh')).toBe(zh)
    expect(speakUnit(symbol, 'ja')).toBe(ja)
    expect(speakUnit(symbol, 'ko')).toBe(ko)
  })

  it('reads a whole unit before it tries a prefix', () => {
    // `min` is minutes, not milli-in, and `cd` is candela, not centi-day. `Pa` is pascal, and `pA` is picoampere.
    expect(speakUnit('min', 'en')).toBe('minutes')
    expect(speakUnit('cd', 'en')).toBe('candelas')
    expect(speakUnit('Pa', 'en')).toBe('pascals')
    expect(speakUnit('pA', 'en')).toBe('picoamperes')
  })

  it('accepts the spellings of micro, and keeps the Chinese reading of kilograms', () => {
    expect(speakUnit('μs', 'en')).toBe('microseconds')
    expect(speakUnit('um', 'en')).toBe('micrometers')
    expect(speakUnit('kg', 'zh')).toBe('公斤')
  })

  it('gives tonnes and bytes only the prefixes that they take', () => {
    // `ft` is feet, not femtotonnes, and `pt` is not picotonnes.
    expect(speakUnit('ft', 'en')).toBe('feet')
    expect(speakUnit('pt', 'en')).toBeUndefined()
    expect(speakUnit('kt', 'en')).toBe('kilotonnes')
    expect(speakUnit('MB', 'en')).toBe('megabytes')
  })

  it('returns undefined for text that is not a unit', () => {
    expect(speakUnit('card', 'en')).toBeUndefined()
  })
})

describe('units in formulas', () => {
  it('reads a unit of `\\mathrm`, also with `\\mu`', () => {
    expect(speech.speak(String.raw`5\,\mathrm{\mu m}`, 'zh')).toBe('5微米')
    expect(speech.speak(String.raw`100\,\mathrm{km/h}`, 'en')).toBe('one hundred kilometers per hour')
    expect(speech.speak(String.raw`2.4\,\mathrm{GHz}`, 'ja')).toBe('にてんよんギガヘルツ')
  })
})
