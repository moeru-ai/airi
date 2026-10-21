import type { SpeechPreprocessor } from '.'

import { describe, expect, it } from 'vitest'

import { mathSpeechPreprocessor, moneySpeechPreprocessor } from '.'
import { defaultSpeechPreprocessors, toSpeechText } from '..'

describe('speech preprocessor host', () => {
  it('reads formulas and prices with the default plugins', () => {
    expect(defaultSpeechPreprocessors().map(preprocessor => preprocessor.name)).toEqual(['money', 'math'])
    expect(toSpeechText('Apples cost $3, and $x^2$ is a square.')).toBe('Apples cost three dollars, and x squared is a square.')
  })

  it('runs prose hooks in installation order, each on the output of the one before', () => {
    const calls: string[] = []
    const tag = (name: string): SpeechPreprocessor => ({
      name,
      prose: (text) => {
        calls.push(name)
        return `${text}[${name}]`
      },
    })

    expect(toSpeechText('hello', { preprocessors: [tag('a'), tag('b')] })).toBe('hello[a][b]')
    expect(calls).toEqual(['a', 'b'])
  })

  it('uses the first formula hook that returns words', () => {
    const quiet: SpeechPreprocessor = { name: 'quiet', formula: () => undefined }
    const named: SpeechPreprocessor = { name: 'named', formula: (tex, { language }) => tex === 'E=mc^2' ? `${language}: mass energy` : undefined }

    expect(toSpeechText('See $E=mc^2$ here.', { preprocessors: [quiet, named, mathSpeechPreprocessor()] })).toBe('See en: mass energy here.')
    expect(toSpeechText('See $x+1$ here.', { preprocessors: [quiet, named, mathSpeechPreprocessor()] })).toBe('See x plus one here.')
  })

  it('keeps the source of a formula that no plugin reads', () => {
    expect(toSpeechText('Value $x+1$.', { preprocessors: [moneySpeechPreprocessor()] })).toBe('Value x+1.')
  })

  it('runs prepare hooks before parsing', () => {
    const shout: SpeechPreprocessor = { name: 'shout', prepare: markdown => markdown.toUpperCase() }
    expect(toSpeechText('*hi*', { preprocessors: [shout] })).toBe('HI')
  })

  it('reads bare TeX in prose through the formula hooks', () => {
    const formula: SpeechPreprocessor = { name: 'formula', formula: () => 'water' }
    expect(toSpeechText(String.raw`Drink \ce{H2O} daily.`, { preprocessors: [mathSpeechPreprocessor(), formula] })).toBe('Drink H two O daily.')
    expect(toSpeechText(String.raw`Drink \ce{H2O} daily.`, { preprocessors: [formula, mathSpeechPreprocessor()] })).toBe('Drink water daily.')
  })

  it('leaves prices in inline code', () => {
    expect(toSpeechText('Run `echo $5` now.')).toBe('Run echo $5 now.')
  })
})
