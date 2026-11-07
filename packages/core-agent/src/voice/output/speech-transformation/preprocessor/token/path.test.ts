import { describe, expect, it } from 'vitest'

import { pathReader } from './path'

describe('pathReader', () => {
  it.each([
    ['index.ts', 'zh', 'index 点 ts'],
    ['README.md', 'en', 'README dot md'],
    ['archive.tar.gz', 'en', 'archive dot tar dot gz'],
    ['./src/index.ts', 'zh', '点 斜杠 src 斜杠 index 点 ts'],
    ['../shared/types.ts', 'en', 'dot dot slash shared slash types dot ts'],
    ['/home/user/notes', 'zh', '斜杠 home 斜杠 user 斜杠 notes'],
    ['~/notes.md', 'en', 'tilde slash notes dot md'],
    ['C:\\Users\\user', 'en', 'C colon backslash Users backslash user'],
    ['.env', 'en', 'dot env'],
    ['main.c', 'en', 'main dot c'],
  ] as const)('reads %s in inline code in %s', (token, language, speech) => {
    expect(pathReader.read(token, { language, kind: 'code' })).toBe(speech)
  })

  it('needs a longer name and extension in prose', () => {
    for (const token of ['e.g', 'U.S', 'main.c', '.env'])
      expect(pathReader.read(token, { language: 'en', kind: 'text' }), token).toBeUndefined()
    expect(pathReader.read('Node.js', { language: 'en', kind: 'text' })).toBe('Node dot js')
  })

  it('does not read a token without a file name or a root', () => {
    for (const token of ['and/or', 'TCP/IP', '1/2', '3.14', 'v1.2.3', '\\alpha'])
      expect(pathReader.read(token, { language: 'en', kind: 'code' }), token).toBeUndefined()
  })
})
