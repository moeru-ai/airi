import { describe, expect, it } from 'vitest'

import { speakAddresses } from './addresses'

describe('speakAddresses', () => {
  it.each([
    ['连接 https://assistant.ihome.cat 时', 'zh', '连接 https assistant 点 ihome 点 cat 时'],
    ['Open https://assistant.ihome.cat now.', 'en', 'Open https assistant dot ihome dot cat now.'],
    ['地址是 http://10.0.0.9:8123/config/areas', 'zh', '地址是 http 10 点 0 点 0 点 9 端口 8123 斜杠 config 斜杠 areas'],
    ['See example.com/docs.', 'en', 'See example dot com slash docs.'],
    ['访问 https://a.io/x?token=1#top 吧', 'zh', '访问 https a 点 io 斜杠 x 吧'],
    ['(see https://a.io)', 'en', '(see https a dot io)'],
    ['See example.com?token=1 now.', 'en', 'See example dot com now.'],
    ['Is it example.com?', 'en', 'Is it example dot com?'],
  ] as const)('reads the address in %s', (text, language, speech) => {
    expect(speakAddresses(text, language)).toBe(speech)
  })

  it('keeps numbers, versions, and abbreviations', () => {
    expect(speakAddresses('Pi is 3.14, v1.2.3 is out, e.g. this.', 'en')).toBe('Pi is 3.14, v1.2.3 is out, e.g. this.')
    expect(speakAddresses('Mail me at neko@ihome.cat', 'en')).toBe('Mail me at neko@ihome.cat')
  })

  it('keeps the marker of a special token in a query', () => {
    const marker = '\uE000'

    expect(speakAddresses(`Open https://a.io/x?q=${marker}1 now.`, 'en')).toBe(`Open https a dot io slash x${marker} now.`)
  })

  it('reads the words of another language in English', () => {
    expect(speakAddresses('https://a.io', 'ja')).toBe('https a dot io')
  })
})
