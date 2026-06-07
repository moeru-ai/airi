import { describe, expect, it } from 'vitest'

import { stripMarkdownFromSpeech } from './markdown-stripper'
import { stripUnreadableSymbols } from './unreadable-symbols-stripper'

describe('stripUnreadableSymbols', () => {
  describe('default behavior (all options true)', () => {
    it('strips emoji from text', () => {
      expect(stripUnreadableSymbols('I ❤️ this!')).toBe('I this!')
    })

    it('strips multiple emoji', () => {
      expect(stripUnreadableSymbols('Hello 🎉🎉🎉 world')).toBe('Hello world')
    })

    it('strips emoji with skin tones', () => {
      expect(stripUnreadableSymbols('Great job 👍🏽')).toBe('Great job')
    })

    it('strips flag emoji', () => {
      expect(stripUnreadableSymbols('I love 🇯🇵 Japan')).toBe('I love Japan')
    })

    it('strips decorative Unicode arrows', () => {
      expect(stripUnreadableSymbols('Go → this way')).toBe('Go this way')
    })

    it('strips box-drawing characters', () => {
      expect(stripUnreadableSymbols('┌───┐\n│ hi│')).toBe('hi')
    })

    it('strips geometric shapes', () => {
      expect(stripUnreadableSymbols('Item ● bullet')).toBe('Item bullet')
    })

    it('strips standalone special chars', () => {
      expect(stripUnreadableSymbols('hello * world')).toBe('hello world')
    })

    it('strips standalone math operators', () => {
      expect(stripUnreadableSymbols('result + value')).toBe('result value')
    })

    it('collapses repeated exclamation marks', () => {
      expect(stripUnreadableSymbols('Wow!!!')).toBe('Wow!')
    })

    it('collapses repeated question marks', () => {
      expect(stripUnreadableSymbols('What???')).toBe('What?')
    })

    it('collapses repeated dots', () => {
      expect(stripUnreadableSymbols('Wait.....')).toBe('Wait…')
    })

    it('collapses repeated dashes', () => {
      expect(stripUnreadableSymbols('Hi----there')).toBe('Hi—there')
    })
  })

  describe('emoji stripping', () => {
    it('removes single emoji', () => {
      expect(stripUnreadableSymbols('Hello 😊')).toBe('Hello')
    })

    it('removes emoji mixed with text', () => {
      expect(stripUnreadableSymbols('I ❤️ coding 🚀')).toBe('I coding')
    })

    it('removes ZWJ sequences', () => {
      // Family emoji or profession emoji are ZWJ sequences
      expect(stripUnreadableSymbols('Meet the 👨‍👩‍👧 family')).toBe('Meet the family')
    })

    it('removes keycap sequences', () => {
      expect(stripUnreadableSymbols('Press #️⃣ for menu')).toBe('Press for menu')
    })

    it('preserves text when stripEmoji is false', () => {
      expect(stripUnreadableSymbols('Hello 😊', { stripEmoji: false })).toBe('Hello 😊')
    })
  })

  describe('decorative Unicode stripping', () => {
    it('removes arrows', () => {
      expect(stripUnreadableSymbols('Click → here ← please')).toBe('Click here please')
    })

    it('removes box-drawing characters', () => {
      expect(stripUnreadableSymbols('┌header─┐\n│content│\n└───────┘')).toBe('header\ncontent')
    })

    it('removes geometric shapes', () => {
      expect(stripUnreadableSymbols('★ important ◆ note ● item')).toBe('important note item')
    })

    it('removes copyright and trademark symbols', () => {
      expect(stripUnreadableSymbols('© 2024 MyCorp™')).toBe('2024 MyCorp')
    })

    it('preserves decorative Unicode when stripDecorativeUnicode is false', () => {
      expect(stripUnreadableSymbols('Go → here', { stripDecorativeUnicode: false })).toBe('Go → here')
    })
  })

  describe('standalone special character stripping', () => {
    it('removes standalone *', () => {
      expect(stripUnreadableSymbols('hello * world')).toBe('hello world')
    })

    it('removes standalone #', () => {
      expect(stripUnreadableSymbols('hello # world')).toBe('hello world')
    })

    it('removes standalone @', () => {
      expect(stripUnreadableSymbols('hello @ world')).toBe('hello world')
    })

    it('removes standalone |', () => {
      expect(stripUnreadableSymbols('hello | world')).toBe('hello world')
    })

    it('removes standalone backslash', () => {
      expect(stripUnreadableSymbols('hello \\ world')).toBe('hello world')
    })

    it('removes standalone tilde', () => {
      expect(stripUnreadableSymbols('hello ~ world')).toBe('hello world')
    })

    it('preserves special chars when stripStandaloneSpecialChars is false', () => {
      expect(stripUnreadableSymbols('hello * world', { stripStandaloneSpecialChars: false })).toBe('hello * world')
    })
  })

  describe('math operator stripping', () => {
    it('removes standalone +', () => {
      expect(stripUnreadableSymbols('a + b')).toBe('a b')
    })

    it('removes standalone =', () => {
      expect(stripUnreadableSymbols('x = y')).toBe('x y')
    })

    it('removes standalone < and >', () => {
      expect(stripUnreadableSymbols('a < b > c')).toBe('a b c')
    })

    it('removes standalone &', () => {
      expect(stripUnreadableSymbols('a & b')).toBe('a b')
    })

    it('removes standalone %', () => {
      expect(stripUnreadableSymbols('50 % off')).toBe('50 off')
    })

    it('preserves operators within words when stripMathOperators is true', () => {
      // C++ has no spaces around ++, so it should be preserved
      expect(stripUnreadableSymbols('I love C++')).toBe('I love C++')
    })

    it('preserves math operators when stripMathOperators is false', () => {
      expect(stripUnreadableSymbols('a + b', { stripMathOperators: false })).toBe('a + b')
    })
  })

  describe('repeated punctuation collapsing', () => {
    it('collapses !!! to !', () => {
      expect(stripUnreadableSymbols('Amazing!!!')).toBe('Amazing!')
    })

    it('collapses ???? to ?', () => {
      expect(stripUnreadableSymbols('Really????')).toBe('Really?')
    })

    it('collapses ..... to …', () => {
      expect(stripUnreadableSymbols('Hmm.....')).toBe('Hmm…')
    })

    it('collapses ---- to —', () => {
      expect(stripUnreadableSymbols('Hi----Bye')).toBe('Hi—Bye')
    })

    it('collapses ~~~ to ~', () => {
      expect(stripUnreadableSymbols('~~~waves~~~')).toBe('~waves~')
    })

    it('does not collapse single punctuation', () => {
      expect(stripUnreadableSymbols('Hello!')).toBe('Hello!')
    })

    it('does not collapse double punctuation', () => {
      expect(stripUnreadableSymbols('Wow!!')).toBe('Wow!!')
      expect(stripUnreadableSymbols('Hmm??')).toBe('Hmm??')
    })

    it('preserves repeated punctuation when collapseRepeatedPunctuation is false', () => {
      expect(stripUnreadableSymbols('Wow!!!', { collapseRepeatedPunctuation: false })).toBe('Wow!!!')
    })
  })

  describe('streaming control token preservation', () => {
    it('preserves <|ACT|> tokens', () => {
      expect(stripUnreadableSymbols('<|ACT {"emotion":"happy"}|> I am so excited!')).toBe(
        '<|ACT {"emotion":"happy"}|> I am so excited!',
      )
    })

    it('preserves <|DELAY|> tokens', () => {
      expect(stripUnreadableSymbols('Wait a moment<|DELAY 1|> okay')).toBe('Wait a moment<|DELAY 1|> okay')
    })

    it('preserves <|CALL|> tokens', () => {
      expect(stripUnreadableSymbols('Let me help <|CALL ["chess.play"]|>')).toBe('Let me help <|CALL ["chess.play"]|>')
    })

    it('preserves tokens alongside emoji stripping', () => {
      expect(stripUnreadableSymbols('<|ACT {"emotion":"happy"}|> 🎉 Great!')).toBe('<|ACT {"emotion":"happy"}|> Great!')
    })

    it('preserves tokens alongside math operator stripping', () => {
      expect(stripUnreadableSymbols('<|DELAY 1|> a + b')).toBe('<|DELAY 1|> a b')
    })
  })

  describe('combined input', () => {
    it('strips Markdown + emoji + decorative + math + repeated punctuation', () => {
      const input =
        '## Hello 🎉\n\nThis is **bold** and *italic* text!!!\n\n- item ● one\n- item two →\n\nCheck [this](https://example.com) out + please.'
      const expected = 'Hello \n\nThis is bold and italic text!\n\nitem one\nitem two \n\nCheck this out please.'
      expect(stripUnreadableSymbols(input)).toBe(expected)
    })

    it('handles text with streaming control tokens and mixed symbols', () => {
      const input = '<|ACT {"emotion":"excited"}|> Wow!!! 🎉🎉 This is **amazing** → go + see'
      const expected = '<|ACT {"emotion":"excited"}|> Wow! This is amazing go see'
      expect(stripUnreadableSymbols(input)).toBe(expected)
    })
  })

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(stripUnreadableSymbols('')).toBe('')
    })

    it('passes through text with no symbols unchanged', () => {
      expect(stripUnreadableSymbols('Hello world, how are you today?')).toBe('Hello world, how are you today?')
    })

    it('handles text that is all emoji', () => {
      expect(stripUnreadableSymbols('🎉🎉🎉')).toBe('')
    })

    it('handles text that is all decorative Unicode', () => {
      expect(stripUnreadableSymbols('→←↑↓')).toBe('')
    })

    it('handles very long symbol sequences', () => {
      const longEmoji = '🎉'.repeat(100)
      expect(stripUnreadableSymbols(longEmoji)).toBe('')
    })

    it('handles text with only streaming control tokens', () => {
      expect(stripUnreadableSymbols('<|ACT|>')).toBe('<|ACT|>')
    })
  })

  describe('options behavior', () => {
    it('strips everything with default options', () => {
      expect(stripUnreadableSymbols('Hi 😊 + wow!!!')).toBe('Hi wow!')
    })

    it('preserves all when all options are false', () => {
      const input = 'Hi 😊 + wow!!! → ●'
      expect(stripUnreadableSymbols(input, {
        stripEmoji: false,
        stripMathOperators: false,
        stripDecorativeUnicode: false,
        stripStandaloneSpecialChars: false,
        collapseRepeatedPunctuation: false,
      })).toBe('Hi 😊 + wow!!! → ●')
    })

    it('only strips emoji when only stripEmoji is true', () => {
      expect(stripUnreadableSymbols('Hi 😊 + wow!!!', {
        stripEmoji: true,
        stripMathOperators: false,
        stripDecorativeUnicode: false,
        stripStandaloneSpecialChars: false,
        collapseRepeatedPunctuation: false,
      })).toBe('Hi + wow!!!')
    })
  })

  describe('backward compatibility', () => {
    it('stripMarkdownFromSpeech still works identically', () => {
      const input = '## Hello\n\nThis is **bold** and *italic*.\n\n- item one\n- item two'
      expect(stripMarkdownFromSpeech(input)).toBe('Hello\n\nThis is bold and italic.\n\nitem one\nitem two')
    })

    it('stripUnreadableSymbols includes Markdown stripping', () => {
      const input = '**bold** and *italic*'
      expect(stripUnreadableSymbols(input)).toBe('bold and italic')
    })
  })
})
