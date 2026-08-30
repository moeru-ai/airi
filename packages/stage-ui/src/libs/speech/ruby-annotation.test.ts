import { describe, expect, it } from 'vitest'

import { createRubyProjector, projectRuby } from './ruby-annotation'

describe('projectRuby', () => {
  it('splits explicit-base ruby into display (base) and speech (reading)', () => {
    expect(projectRuby('｜約束《やくそく》は')).toEqual({
      displayText: '約束は',
      speechText: 'やくそくは',
    })
  })

  it('passes through text without annotations unchanged', () => {
    const s = 'Hello, world! 普通のテキストです。'
    expect(projectRuby(s)).toEqual({ displayText: s, speechText: s })
  })

  it('handles multiple annotations in one string', () => {
    expect(projectRuby('｜今日《きょう》は｜晴《は》れ')).toEqual({
      displayText: '今日は晴れ',
      speechText: 'きょうははれ',
    })
  })

  it('treats a lone 《…》 without a base mark as literal text', () => {
    const s = '彼は《強い》と言った'
    expect(projectRuby(s)).toEqual({ displayText: s, speechText: s })
  })

  it('emits an unterminated annotation verbatim (no text loss)', () => {
    expect(projectRuby('｜約束《やくそく')).toEqual({
      displayText: '｜約束《やくそく',
      speechText: '｜約束《やくそく',
    })
    expect(projectRuby('｜約束')).toEqual({
      displayText: '｜約束',
      speechText: '｜約束',
    })
  })

  it('handles empty input', () => {
    expect(projectRuby('')).toEqual({ displayText: '', speechText: '' })
  })
})

describe('createRubyProjector — streaming boundary safety', () => {
  const input = '｜約束《やくそく》は｜晴《は》れ、tail'
  const whole = projectRuby(input)

  it('produces identical output for every possible chunk split point', () => {
    for (let i = 1; i < input.length; i++) {
      const p = createRubyProjector()
      const a = p.push(input.slice(0, i))
      const b = p.push(input.slice(i))
      const c = p.flush()
      expect({
        displayText: a.displayText + b.displayText + c.displayText,
        speechText: a.speechText + b.speechText + c.speechText,
      }).toEqual(whole)
    }
  })

  it('survives one-character-at-a-time streaming', () => {
    const p = createRubyProjector()
    let displayText = ''
    let speechText = ''
    for (const ch of input) {
      const r = p.push(ch)
      displayText += r.displayText
      speechText += r.speechText
    }
    const f = p.flush()
    expect({
      displayText: displayText + f.displayText,
      speechText: speechText + f.speechText,
    }).toEqual(whole)
  })

  it('withholds a partial annotation until it completes', () => {
    const p = createRubyProjector()
    // The annotation is still open — nothing should surface yet.
    expect(p.push('｜約束《やく')).toEqual({ displayText: '', speechText: '' })
    // Closing chunk commits base to display and reading to speech.
    expect(p.push('そく》です')).toEqual({
      displayText: '約束です',
      speechText: 'やくそくです',
    })
  })
})
