import { describe, expect, it } from 'vitest'

import { speakAddress } from './addresses'

describe('speakAddress', () => {
  it.each([
    ['https://home.example.com', 'zh', 'https home 点 example 点 com'],
    ['https://home.example.com', 'en', 'https home dot example dot com'],
    ['http://192.0.2.10:8123/config/areas', 'zh', 'http 192 点 0 点 2 点 10 端口 8123 斜杠 config 斜杠 areas'],
    ['example.com/docs', 'en', 'example dot com slash docs'],
    ['https://a.io/x?token=1#top', 'zh', 'https a 点 io 斜杠 x'],
    ['example.com?token=1', 'en', 'example dot com'],
    ['http://localhost:8123', 'en', 'http localhost port 8123'],
    ['https://example.com/文档/指南', 'zh', 'https example 点 com 斜杠 文档 斜杠 指南'],
  ] as const)('reads %s in %s', (text, language, speech) => {
    expect(speakAddress(text, language)).toBe(speech)
  })

  it('reads only a text that is one address', () => {
    expect(speakAddress('curl https://a.io', 'en')).toBeUndefined()
    expect(speakAddress('3.14', 'en')).toBeUndefined()
    expect(speakAddress('v1.2.3', 'en')).toBeUndefined()
    expect(speakAddress('user@example.com', 'en')).toBeUndefined()
    expect(speakAddress('fetch failed', 'en')).toBeUndefined()
    expect(speakAddress('mailto:user@example.com', 'en')).toBeUndefined()
    expect(speakAddress('a:b', 'en')).toBeUndefined()
    expect(speakAddress('localhost:8123', 'en')).toBeUndefined()
  })

  it('keeps the marker of a special token in a query', () => {
    const marker = ''

    expect(speakAddress(`https://a.io/x?q=${marker}1`, 'en')).toBe(`https a dot io slash x${marker}`)
  })

  it('reads the words of another language in English', () => {
    expect(speakAddress('https://a.io', 'ja')).toBe('https a dot io')
  })
})
