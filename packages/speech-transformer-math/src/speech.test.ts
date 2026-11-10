import type { MathSpeechExtension } from './extension'
import type { MathLocale } from './locale'

import { describe, expect, it } from 'vitest'

import { en } from './locales/en'
import { MathSpeech } from './speech'

describe('mathSpeech', () => {
  it('resolves BCP 47 codes to the built-in packs', () => {
    const speech = new MathSpeech()
    expect(speech.locale('zh-CN').language).toBe('zh')
    expect(speech.locale('yue-HK').language).toBe('zh')
    expect(speech.locale('ko_KR').language).toBe('ko')
    expect(speech.findLocale('th-TH')).toBeUndefined()
    expect(speech.locale('th-TH')).toBe(en)
    expect(speech.locale(undefined)).toBe(en)
  })

  it('adds a language that a contributor registers', () => {
    const pirate: MathLocale = {
      ...en,
      language: 'pi',
      operators: { ...en.operators, '+': 'and a' },
    }
    const speech = new MathSpeech()
    speech.register(pirate)

    expect(speech.findLocale('pi-CARIB')?.language).toBe('pi')
    expect(speech.speak('x+1', 'pi')).toBe('x and a one')
  })

  it('replaces a built-in pack and restores it', () => {
    const speech = new MathSpeech()
    const restore = speech.register({ ...en, units: { ...en.units, units: { ...en.units.units, m: 'metres' } } })
    expect(speech.speak(String.raw`5\,\mathrm{km}`, 'en')).toBe('five kilometres')

    restore()
    expect(speech.speak(String.raw`5\,\mathrm{km}`, 'en')).toBe('five kilometers')
  })

  it('keeps the packs of each instance apart', () => {
    const custom = new MathSpeech({ locales: [{ ...en, operators: { ...en.operators, '+': 'and' } }] })
    expect(custom.speak('x+1', 'en')).toBe('x and one')
    expect(new MathSpeech().speak('x+1', 'en')).toBe('x plus one')
  })

  it('lowers and reads the raw commands of an extension', () => {
    const shout: MathSpeechExtension = {
      name: 'shout',
      rawCommands: ['shout'],
      lower: (_, source) => ['Shout', `'${source}'`],
      render: { Shout: ([, value]) => String(value).slice(1, -1).toUpperCase() },
    }
    const speech = new MathSpeech({ extensions: [shout] })
    expect(speech.toMathJson(String.raw`\shout{hi}`)).toEqual(['Shout', '\'hi\''])
    expect(speech.speak(String.raw`x = \shout{hi}`, 'en')).toBe('x equals HI')
  })

  it('reads a raw command without an extension as its source text', () => {
    expect(new MathSpeech({ extensions: [{ name: 'empty', rawCommands: ['shout'] }] }).speak(String.raw`\shout{hi}`, 'en')).toBe('hi')
  })

  it('rejects two extensions that read one command or one head', () => {
    const shout: MathSpeechExtension = { name: 'shout', rawCommands: ['shout'], render: { Shout: () => '' } }
    expect(() => new MathSpeech({ extensions: [shout, { name: 'other', rawCommands: ['shout'] }] })).toThrow('both read \\shout')
    expect(() => new MathSpeech({ extensions: [shout, { name: 'other', render: { Shout: () => '' } }] })).toThrow('both read the head Shout')
    expect(new MathSpeech({ extensions: [shout] }).rawCommands).toEqual(['shout'])
  })
})
