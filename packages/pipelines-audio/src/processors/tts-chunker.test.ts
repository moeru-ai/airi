// packages/pipelines-audio/src/processors/tts-chunker.test.ts

import type { TtsInputChunk } from './tts-chunker'

import { describe, expect, it } from 'vitest'

import { chunkTtsInput, isProbablyAngleTag, processNarrative, TTS_SPECIAL_TOKEN } from './tts-chunker'

async function collectChunkText(input: string) {
  const chunks: string[] = []

  for await (const chunk of chunkTtsInput(input))
    chunks.push(chunk.text)

  return chunks
}

async function collectChunks(text: string): Promise<TtsInputChunk[]> {
  const chunks: TtsInputChunk[] = []
  for await (const chunk of chunkTtsInput(text))
    chunks.push(chunk)
  return chunks
}

describe('chunkTtsInput sentence ends', () => {
  // ROOT CAUSE:
  //
  // Each `.` that did not follow a digit ended a chunk, so `home.example.com` became three TTS requests, and the voice
  // read each part with a sentence-end tone and a pause. A `.` before a letter is inside a token.
  it('keeps a token with a dot in one chunk', async () => {
    expect(await collectChunkText('连接 https://home.example.com 时失败了。'))
      .toEqual(['连接 https://home.example.com 时失败了。'])
    expect(await collectChunkText('Open index.ts and README.md now.')).toEqual(['Open index.ts and README.md now.'])
  })

  it('still ends a sentence at a dot before a space, CJK text, punctuation, or the end', async () => {
    expect(await collectChunkText('It works. The U.S. team agrees.')).toEqual(['It works.', 'The U.S.', 'team agrees.'])
    expect(await collectChunkText('完成了.接下来开始吧.')).toEqual(['完成了.', '接下来开始吧.'])
    expect(await collectChunkText('Read the guide (see it.) now.')).toEqual(['Read the guide (see it.', ') now.'])
  })

  it('keeps numbers and reads three dots as an ellipsis', async () => {
    expect(await collectChunkText('Pi is 3.14 and 1,000 is big. Wait... ok.')).toEqual(['Pi is 3.14 and 1,000 is big.', 'Wait…', 'ok.'])
  })
})

describe('chunkTtsInput length limit', () => {
  async function collectReasonsAndText(text: string) {
    return (await collectChunks(text)).map(chunk => [chunk.reason, chunk.text])
  }

  // ROOT CAUSE:
  //
  // The length limit ended a chunk at any soft punctuation, also at the Chinese `、` between list items. So
  // 网络、地址解析 became two TTS requests, and the voice paused in the middle of the list.
  // Each case opens with two sentences, so the boost chunks end before the length limit decides.
  it('does not end a chunk at a Chinese list separator', async () => {
    expect(await collectReasonsAndText('我这里只能看到工具返回的错误：连接 Home Assistant 地址时，网络请求失败。它没有提供更具体的原因或 HTTP 状态码，所以我没法判断究竟是网络、地址解析还是服务端暂时不可用。')).toEqual([
      ['boost', '我这里只能看到工具返回的错误：'],
      ['boost', '连接 Home Assistant 地址时，'],
      ['hard', '网络请求失败。'],
      ['limit', '它没有提供更具体的原因或 HTTP 状态码，'],
      ['hard', '所以我没法判断究竟是网络、地址解析还是服务端暂时不可用。'],
    ])
  })

  it('ends a chunk at a Japanese comma', async () => {
    expect(await collectReasonsAndText('今日は晴れです。散歩しました。公園へ行って、少し散歩してから、カフェでコーヒーを飲んで、本を読みました。')).toEqual([
      ['hard', '今日は晴れです。'],
      ['hard', '散歩しました。'],
      ['limit', '公園へ行って、少し散歩してから、'],
      ['hard', 'カフェでコーヒーを飲んで、本を読みました。'],
    ])
  })

  it('ends a chunk at a Chinese list separator after twice the word limit', async () => {
    expect(await collectReasonsAndText('这是第一句。这是第二句。支持的格式有 PNG、JPEG、WebP、GIF、AVIF、BMP、TIFF、SVG、HEIC、ICO、PSD、RAW、EXR、HDR、TGA、DDS、JXL、QOI、PCX、WBMP、XBM、XPM、CUR、ANI、EPS、AI、PDF、DNG、CR2、NEF 等等。')).toEqual([
      ['hard', '这是第一句。'],
      ['hard', '这是第二句。'],
      ['limit', '支持的格式有 PNG、JPEG、WebP、GIF、AVIF、BMP、TIFF、SVG、HEIC、ICO、PSD、RAW、EXR、HDR、TGA、DDS、JXL、QOI、PCX、WBMP、'],
      ['hard', 'XBM、XPM、CUR、ANI、EPS、AI、PDF、DNG、CR2、NEF 等等。'],
    ])
  })
})

describe('chunkTtsInput boost', () => {
  // ROOT CAUSE:
  //
  // Boost chunks ended at any soft punctuation regardless of length, so "嗯，那就好，" became
  // "嗯，" plus "那就好，". A TTS request costs the same however short its text, so those
  // fragments delayed the audio boost exists to bring forward.
  it('does not yield boost fragments shorter than the minimum word count', async () => {
    const chunks = await collectChunks('嗯，那就好，听你说没事我心里就踏实了。倒是你，现在都两点了，')

    expect(chunks[0]?.text).not.toBe('嗯，')
    expect(chunks[0]?.text.startsWith('嗯，那就好，')).toBe(true)
    for (const chunk of chunks.filter(chunk => chunk.reason === 'boost'))
      expect(chunk.words).toBeGreaterThanOrEqual(4)
  })

  it('still yields a long opening clause early at soft punctuation', async () => {
    const chunks = await collectChunks('I really want to tell you something, and then I will say more.')

    expect(chunks[0]).toMatchObject({ text: 'I really want to tell you something,', reason: 'boost' })
  })
})

describe('tTS Chunker Logic Cleanup', () => {
  describe('isProbablyAngleTag Heuristics', () => {
    it('should identify narrative tags', () => {
      expect(isProbablyAngleTag(0, '<sigh>')).toBe(true)
    })

    it('should skip code patterns like generics', () => {
      expect(isProbablyAngleTag(4, 'List<String>')).toBe(false)
      expect(isProbablyAngleTag(1, 'x<y')).toBe(false)
    })
  })

  describe('processNarrative Function', () => {
    const options = { stripNarrative: true }

    it('should strip standard bracketed narrative', () => {
      expect(processNarrative('Hello [sighs] world', options)).toBe('Hello  world')
      expect(processNarrative('<<tag>>', options)).toBe('')
    })

    it('should restore stripping for CJK brackets', () => {
      expect(processNarrative('你好（叹气）世界', options)).toBe('你好世界')
      expect(processNarrative('【动作】你好', options)).toBe('你好')
    })

    it('should fix asterisk bullet leakage', () => {
      expect(processNarrative('* item 1', options)).toBe('* item 1')
      expect(processNarrative('*bold text*', options)).toBe('')
      expect(processNarrative('a*b', options)).toBe('a*b')
    })

    it('should handle complex nesting correctly', () => {
      expect(processNarrative('Normal (nested [action]) text', options)).toBe('Normal  text')
    })

    it('should handle open bracket correctly', () => {
      expect(processNarrative('Version (beta', options)).toBe('Version (beta')
    })

    it('should handle valid narrative tag', () => {
      expect(processNarrative('Hello,<laugh>', options)).toBe('Hello,')
      expect(processNarrative('Hello<laugh>', options)).toBe('Hello')
      expect(processNarrative('<laughs>Hello', options)).toBe('Hello')
      expect(processNarrative('Hello<laughs>', options)).toBe('Hello')
      expect(processNarrative('你好<laughs>', options)).toBe('你好')
      expect(processNarrative('List<T>', options)).toBe('List<T>')
    })

    it('should preserve code literals in keepNarrativeText mode', () => {
      const keepOptions = { stripNarrative: true, keepNarrativeText: true }
      expect(processNarrative('Value is List<String> [action]', keepOptions)).toContain('List<String>')
      expect(processNarrative('x < y (sigh)', keepOptions)).toContain('x < y')
      expect(processNarrative('price<limit', keepOptions)).toContain('price<limit')
    })

    it('should be case-insensitive for narrative tags', () => {
      const options = { stripNarrative: true }
      expect(processNarrative('Hello<LAUGHs>', options)).toBe('Hello')
      expect(processNarrative('abc<Action>', options)).toBe('abc')
      expect(processNarrative('List<String>', options)).toBe('List<String>')
    })
  })

  describe('isProbablyAngleTag Stream Prefix Handling', () => {
    it('should identify partial prefixes of narrative keywords', () => {
      expect(isProbablyAngleTag(5, 'hello<sm')).toBe(true)
      expect(isProbablyAngleTag(5, 'hello<la')).toBe(true) // laugh 的前缀
    })

    it('should not identify non-narrative prefixes as tags', () => {
      expect(isProbablyAngleTag(4, 'List<Str')).toBe(false)
    })
  })

  describe('edge Cases test', () => {
    it('should not treat single-letter operands as narrative prefixes', () => {
      expect(isProbablyAngleTag(1, 'a<b')).toBe(false)
      expect(isProbablyAngleTag(1, 'x<s')).toBe(false)
    })

    it('should support non-CJK Unicode letters as tag context', () => {
      expect(isProbablyAngleTag(4, 'café<laugh>')).toBe(true)
      expect(isProbablyAngleTag(6, 'привет<sigh>')).toBe(true)
    })
  })

  describe('chunkTtsInput grapheme preservation', () => {
    // ROOT CAUSE:
    //
    // CRLF is one grapheme cluster, but the hard punctuation set contains
    // only separate CR and LF characters. Normalize CRLF before matching
    // punctuation so Windows line endings end the chunk.
    // https://github.com/moeru-ai/airi/pull/2414
    it('treats CRLF as a hard chunk boundary (Issue #2366)', async () => {
      expect(await collectChunkText('abc\r\ndef')).toEqual(['abc', 'def'])
    })

    // ROOT CAUSE:
    //
    // `readGraphemeClusters` returns multi-code-unit grapheme strings.
    // The old `value.length > 1` guard discarded them.
    //
    // We fixed this by preserving each returned cluster.
    // This keeps Thai combining marks intact.
    //
    // https://github.com/moeru-ai/airi/issues/2366
    it('preserves Thai combining clusters while chunking (Issue #2366)', async () => {
      const input = 'ดึกป่านนี้แล้วยังจะหาเรื่องกินอีกนะคะเนี่ย!'

      const chunks = await collectChunkText(input)

      expect(chunks.join('')).toBe(input)
    })

    it('keeps a kept punctuation once, with its own sentence, at the length limit', async () => {
      const chunks = await collectChunkText('直觉上，模型在学习：“处于位置 x下标t、时间为 t 时，应该往哪个方向、以多快的速度移动？”生成时，从噪声出发。')

      expect(chunks.join('').split('？')).toHaveLength(2)
      expect(chunks.some(chunk => chunk.endsWith('方向、？'))).toBe(false)
    })

    it('does not send a chunk without sound, as a lone closing quote', async () => {
      const chunks = await collectChunkText('以多快的速度移动？”\n生成时。')

      expect(chunks).not.toContain('”')
      expect(chunks.every(chunk => /[\p{L}\p{N}]/u.test(chunk))).toBe(true)
    })

    it('preserves emoji grapheme clusters while chunking', async () => {
      const input = '👩‍💻👍🏽!'

      const chunks = await collectChunkText(input)

      expect(chunks.join('')).toBe(input)
    })
  })
})

// https://github.com/moeru-ai/airi/issues/3345
// ROOT CAUSE:
//
// A period at an empty buffer reads ahead for token or ellipsis checks.
// The empty-buffer branch then advances again and drops the read-ahead grapheme.
//
// Keep token continuations first, then reuse lookahead when a boundary has no buffered text.
describe('chunkTtsInput punctuation lookahead (Issue #3345)', () => {
  it.each([
    { label: 'a leading period', input: '.NET is great.', expected: '.NET is great.' },
    { label: 'a period after hard punctuation', input: 'Really?.NET works.', expected: 'Really?.NET works.' },
    { label: 'two periods after hard punctuation', input: 'Hmm!..No way.', expected: 'Hmm!.No way.' },
  ])('preserves lookahead after an empty-buffer period: $label', async ({ input, expected }) => {
    expect((await collectChunkText(input)).join('')).toBe(expected)
  })

  it('preserves a special token after an empty-buffer period', async () => {
    const chunks = await collectChunks(`Ok!.${TTS_SPECIAL_TOKEN}No.`)

    expect(chunks.map(chunk => chunk.reason)).toEqual(['hard', 'special', 'hard'])
    expect(chunks.map(chunk => chunk.text).join('')).toBe('Ok!No.')
  })
})
