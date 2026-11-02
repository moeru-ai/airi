import { describe, expect, it } from 'vitest'

import { speakAddress } from './addresses'

describe('speakAddress', () => {
  it.each([
    ['https://assistant.ihome.cat', 'zh', 'https assistant 点 ihome 点 cat'],
    ['https://assistant.ihome.cat', 'en', 'https assistant dot ihome dot cat'],
    ['http://10.0.0.9:8123/config/areas', 'zh', 'http 10 点 0 点 0 点 9 端口 8123 斜杠 config 斜杠 areas'],
    ['example.com/docs', 'en', 'example dot com slash docs'],
    ['https://a.io/x?token=1#top', 'zh', 'https a 点 io 斜杠 x'],
    ['example.com?token=1', 'en', 'example dot com'],
  ] as const)('reads %s in %s', (text, language, speech) => {
    expect(speakAddress(text, language)).toBe(speech)
  })

  it('reads only a text that is one address', () => {
    expect(speakAddress('curl https://a.io', 'en')).toBeUndefined()
    expect(speakAddress('3.14', 'en')).toBeUndefined()
    expect(speakAddress('v1.2.3', 'en')).toBeUndefined()
    expect(speakAddress('neko@ihome.cat', 'en')).toBeUndefined()
    expect(speakAddress('fetch failed', 'en')).toBeUndefined()
  })

  it('keeps the marker of a special token in a query', () => {
    const marker = ''

    expect(speakAddress(`https://a.io/x?q=${marker}1`, 'en')).toBe(`https a dot io slash x${marker}`)
  })

  it('reads the words of another language in English', () => {
    expect(speakAddress('https://a.io', 'ja')).toBe('https a dot io')
  })
})
