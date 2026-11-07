import { describe, expect, it } from 'vitest'

import { addressReader } from './address'

const read = (token: string, language = 'en') => addressReader.read(token, { language, kind: 'code' })

describe('addressReader', () => {
  it.each([
    ['https://home.example.com', 'zh', 'https home 点 example 点 com'],
    ['https://home.example.com', 'en', 'https home dot example dot com'],
    ['http://192.0.2.10:8123/config/areas', 'zh', 'http 192 点 0 点 2 点 10 端口 8123 斜杠 config 斜杠 areas'],
    ['https://a.io/x?token=1#top', 'zh', 'https a 点 io 斜杠 x'],
    ['https://example.com/docs/', 'en', 'https example dot com slash docs'],
    ['https://example.com:443/x', 'en', 'https example dot com port 443 slash x'],
    ['https://user:secret@example.com/x', 'en', 'https example dot com slash x'],
    ['HTTPS://Example.COM/Docs', 'en', 'HTTPS Example dot COM slash Docs'],
    ['https://例子.中国/路径', 'zh', 'https 例子 点 中国 斜杠 路径'],
    ['https://example.com/a%20b', 'en', 'https example dot com slash a b'],
    ['http://[::1]:8123', 'en', 'http [::1] port 8123'],
    ['http://localhost:3000', 'en', 'http localhost port 3000'],
    ['file:///home/user/notes.md', 'en', 'file slash home slash user slash notes dot md'],
    ['example.com/docs', 'en', 'example dot com slash docs'],
    ['example.com?token=1', 'en', 'example dot com'],
    ['192.0.2.10:8123/config', 'zh', '192 点 0 点 2 点 10 端口 8123 斜杠 config'],
  ] as const)('reads %s in %s', (token, language, speech) => {
    expect(read(token, language)).toBe(speech)
  })

  it('does not read a token that it cannot recognize as an address', () => {
    for (const token of ['3.14', 'v1.2.3', '1.2.3.4', '192.0.2.10', 'user@example.com', 'mailto:user@example.com', 'a:b', 'localhost:8123'])
      expect(read(token), token).toBeUndefined()
  })
})
