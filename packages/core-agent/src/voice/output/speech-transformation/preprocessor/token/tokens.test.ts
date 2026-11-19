import type { SpeechTokenReader } from './types'

import { describe, expect, it } from 'vitest'

import { defaultTokenReaders } from '.'
import { speakTokens } from './tokens'

const speak = (text: string, kind: 'text' | 'code' = 'text', language = 'en') => speakTokens(text, { language, kind }, defaultTokenReaders())

describe('speakTokens', () => {
  it('reads each recognized token and keeps the rest of the text', () => {
    expect(speak('Is it example.com? See https://a.io now.')).toBe('Is it example dot com? See https a dot io now.')
    expect(speak('访问example.com吧', 'text', 'zh')).toBe('访问example 点 com吧')
    expect(speak('Open index.ts and read README.md.')).toBe('Open index dot ts and read README dot md.')
    expect(speak('curl https://a.io/x', 'code')).toBe('curl https a dot io slash x')
    expect(speak('.env', 'code')).toBe('dot env')
    expect(speak('/etc', 'code')).toBe('slash etc')
  })

  it('keeps tokens that no reader recognizes', () => {
    expect(speak('Use and/or, e.g. 3.14 or v1.2.3, at noon.')).toBe('Use and/or, e.g. 3.14 or v1.2.3, at noon.')
    expect(speak('pnpm -F @proj-airi/stage-ui typecheck', 'code')).toBe('pnpm -F @proj-airi/stage-ui typecheck')
  })

  it('keeps the marker of a special token after the words', () => {
    const marker = ''

    expect(speak(`Open https://a.io/x?q=${marker}1 now.`)).toBe(`Open https a dot io slash x${marker} now.`)
  })

  it('uses the first reader that recognizes a token', () => {
    const shout: SpeechTokenReader = { name: 'shout', read: token => token.endsWith('.io') ? token.toUpperCase() : undefined }

    expect(speakTokens('See a.io and index.ts.', { language: 'en', kind: 'text' }, [shout, ...defaultTokenReaders()])).toBe('See A.IO and index dot ts.')
  })
})
