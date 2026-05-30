import { describe, expect, it } from 'vitest'

import { stripMarkdownFromSpeech } from './markdown-stripper'

describe('stripMarkdownFromSpeech', () => {
  describe('bold', () => {
    it('strips **bold** markers', () => {
      expect(stripMarkdownFromSpeech('I **really** love this!')).toBe('I really love this!')
    })

    it('strips multiple bold segments', () => {
      expect(stripMarkdownFromSpeech('**Hello** world **everyone**')).toBe('Hello world everyone')
    })

    it('strips bold with multi-word content', () => {
      expect(stripMarkdownFromSpeech('This is **very important** news')).toBe('This is very important news')
    })
  })

  describe('italic', () => {
    it('strips *italic* markers', () => {
      expect(stripMarkdownFromSpeech('I *really* love this!')).toBe('I really love this!')
    })

    it('strips _italic_ markers', () => {
      expect(stripMarkdownFromSpeech('I _really_ love this!')).toBe('I really love this!')
    })
  })

  describe('strikethrough', () => {
    it('strips ~~strikethrough~~ markers', () => {
      expect(stripMarkdownFromSpeech('~~deleted~~ text')).toBe('deleted text')
    })
  })

  describe('links', () => {
    it('strips link syntax, preserving text', () => {
      expect(stripMarkdownFromSpeech('Check [this link](https://example.com) out')).toBe('Check this link out')
    })

    it('strips multiple links', () => {
      expect(stripMarkdownFromSpeech('[first](url1) and [second](url2)')).toBe('first and second')
    })
  })

  describe('headings', () => {
    it('strips ## heading markers', () => {
      expect(stripMarkdownFromSpeech('## My Heading')).toBe('My Heading')
    })

    it('strips # single hash heading', () => {
      expect(stripMarkdownFromSpeech('# Title')).toBe('Title')
    })

    it('strips ###### six hash heading', () => {
      expect(stripMarkdownFromSpeech('###### Deep')).toBe('Deep')
    })

    it('does not strip # mid-sentence', () => {
      expect(stripMarkdownFromSpeech('Issue #123 is fixed')).toBe('Issue #123 is fixed')
    })
  })

  describe('bullet lists', () => {
    it('strips - bullet markers', () => {
      expect(stripMarkdownFromSpeech('- item one\n- item two\n- item three')).toBe('item one\nitem two\nitem three')
    })

    it('strips * bullet markers', () => {
      expect(stripMarkdownFromSpeech('* item one\n* item two')).toBe('item one\nitem two')
    })
  })

  describe('numbered lists', () => {
    it('strips numbered list markers', () => {
      expect(stripMarkdownFromSpeech('1. first\n2. second\n3. third')).toBe('first\nsecond\nthird')
    })
  })

  describe('blockquotes', () => {
    it('strips > blockquote markers', () => {
      expect(stripMarkdownFromSpeech('> quoted text')).toBe('quoted text')
    })
  })

  describe('code fences', () => {
    it('strips code fence markers, preserving code', () => {
      expect(stripMarkdownFromSpeech('```\nconst x = 1\n```')).toBe('const x = 1\n')
    })

    it('strips code fence with language tag', () => {
      expect(stripMarkdownFromSpeech('```typescript\nconst x: number = 1\n```')).toBe('const x: number = 1\n')
    })
  })

  describe('inline code', () => {
    it('strips inline code markers', () => {
      expect(stripMarkdownFromSpeech('Use the `print()` function')).toBe('Use the print() function')
    })
  })

  describe('horizontal rules', () => {
    it('strips --- horizontal rules', () => {
      expect(stripMarkdownBeforeAndAfter('---')).toBe('')
    })

    it('strips *** horizontal rules', () => {
      expect(stripMarkdownFromSpeech('before\n***\nafter')).toBe('before\n\nafter')
    })
  })

  describe('tables', () => {
    it('strips table pipe syntax', () => {
      expect(stripMarkdownFromSpeech('| col1 | col2 |\n| val1 | val2 |')).toBe('col1  col2\nval1  val2')
    })
  })

  describe('combined Markdown', () => {
    it('strips multiple Markdown types in a single response', () => {
      const input =
        '## Hello\n\nThis is **bold** and *italic* text.\n\n- item one\n- item two\n\nCheck [this](https://example.com) out.'
      const expected = 'Hello\n\nThis is bold and italic text.\n\nitem one\nitem two\n\nCheck this out.'
      expect(stripMarkdownFromSpeech(input)).toBe(expected)
    })
  })

  describe('streaming control token preservation', () => {
    it('preserves <|ACT|> tokens', () => {
      expect(stripMarkdownFromSpeech('<|ACT {"emotion":"happy"}|> I am so excited!')).toBe(
        '<|ACT {"emotion":"happy"}|> I am so excited!',
      )
    })

    it('preserves <|DELAY|> tokens', () => {
      expect(stripMarkdownFromSpeech('Wait a moment<|DELAY 1|> okay')).toBe('Wait a moment<|DELAY 1|> okay')
    })

    it('preserves <|CALL|> tokens', () => {
      expect(stripMarkdownFromSpeech('Let me help <|CALL ["chess.play"]|>')).toBe('Let me help <|CALL ["chess.play"]|>')
    })
  })

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(stripMarkdownFromSpeech('')).toBe('')
    })

    it('passes through text with no Markdown unchanged', () => {
      expect(stripMarkdownFromSpeech('Hello world, how are you today?')).toBe('Hello world, how are you today?')
    })

    it('does not strip standalone * in math expressions', () => {
      // The lazy quantifier + paired marker requirement means standalone * won't match
      expect(stripMarkdownFromSpeech('5 * 3 = 15')).toBe('5 * 3 = 15')
    })

    it('handles unclosed markers gracefully', () => {
      // Unclosed ** won't match the regex, so it passes through
      expect(stripMarkdownFromSpeech('This is **unclosed')).toBe('This is **unclosed')
    })

    it('handles nested bold+italic patterns', () => {
      // **_text_** — bold wraps italic
      expect(stripMarkdownFromSpeech('**_bold italic_**')).toBe('bold italic')
    })
  })
})

/**
 * Helper to strip Markdown from text surrounded by newlines,
 * useful for testing horizontal rules that need line boundaries.
 */
function stripMarkdownBeforeAndAfter(text: string): string {
  return stripMarkdownFromSpeech(`before\n${text}\nafter`).replace('before\n', '').replace('\nafter', '')
}
