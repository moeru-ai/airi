import type { UncertainSpan } from './asr-uncertainty/analysis'
import type { PhoneticVocabularyEntry } from './phonetic-vocabulary'

import { describe, expect, it } from 'vitest'

import { locateTokens } from './asr-uncertainty/analysis'
import { english, pronounceEnglish } from './phonetic-english'
import { mandarin, pronounceChinese } from './phonetic-mandarin'
import { createPhoneticMatcher } from './phonetic-match'
import { boostHotwords, guideCandidates, matchUncertainSpans, phraseEntries, selectGuidedSuggestions } from './span-guided-terms'

const sulfurCube: PhoneticVocabularyEntry = {
  term: 'Sulfur Cube',
  writtenForms: ['硫方怪'],
  pronunciations: [['l', 'iú', 'f', 'āng', 'g', 'uài']],
  description: 'A cube-shaped Minecraft mob that lives near sulfur springs.',
  source: 'minecraft-wiki',
}

const pronounce = (text: string) => pronounceChinese(text) ?? pronounceEnglish(text)

/** The decode heard `我遇到了一只流氓怪`. Only `氓` is unstable, and the other decodes heard `方` or `芳` there. */
const mandarinTranscript = locateTokens([...'我遇到了一只流氓怪'])
const mandarinSpan: UncertainSpan = { kind: 'unstable', start: 1.4, end: 1.6, tokenStart: 7, tokenEnd: 8, variants: [{ text: '方', count: 5 }, { text: '芳', count: 2 }] }

describe('matchUncertainSpans', () => {
  it('reads the neighbors of a span, so one unstable syllable still matches a three-syllable term', () => {
    const [candidate, ...rest] = matchUncertainSpans(mandarinTranscript, [mandarinSpan], [sulfurCube], [mandarin])

    expect(rest).toEqual([])
    expect(candidate.term).toBe('Sulfur Cube')
    expect(candidate.span).toBe('流氓怪')
    expect(mandarinTranscript.text.slice(candidate.start, candidate.end)).toBe('流氓怪')
    // The variant 方 makes the heard text 流方怪, which is closer to 硫方怪 than the transcript text.
    expect(candidate.heard).toBe('方')
    expect(candidate.heardCount).toBe(5)
  })

  it('ignores a term that sounds like the neighbors but not like the span', () => {
    const spanOnFirstWord: UncertainSpan = { kind: 'unstable', tokenStart: 0, tokenEnd: 1, variants: [{ text: '哦', count: 3 }] }

    expect(matchUncertainSpans(mandarinTranscript, [spanOnFirstWord], [sulfurCube], [mandarin], { contextTokens: 2 })).toEqual([])
  })

  it('scores 1 for a variant that spells the term that the transcript misses', () => {
    const transcript = locateTokens(['▁I', '▁use', '▁ZU', 'STAN', '▁daily'])
    const span: UncertainSpan = { kind: 'unstable', tokenStart: 2, tokenEnd: 4, variants: [{ text: 'Zustand', count: 4 }] }
    const entries = phraseEntries(['Zustand'], pronounce, { source: 'conversation', description: '' })

    const [candidate] = matchUncertainSpans(transcript, [span], entries, [english])

    expect(candidate.score).toBe(1)
    expect(candidate.span).toBe('ZUSTAN')
    expect(candidate.heard).toBe('Zustand')
  })

  it('keeps a word whole when the span covers only part of it', () => {
    const transcript = locateTokens(['▁I', '▁use', '▁ZU', 'STAN', '▁daily'])
    const span: UncertainSpan = { kind: 'unstable', tokenStart: 3, tokenEnd: 4, variants: [{ text: 'STAND', count: 4 }] }
    const entries = phraseEntries(['Zustand'], pronounce, { source: 'conversation', description: '' })

    const [candidate] = matchUncertainSpans(transcript, [span], entries, [english])

    expect(candidate.heard).toBe('STAND')
    expect(candidate.score).toBe(1)
    expect(candidate.span).toBe('ZUSTAN')
  })

  it('drops a variant that only changes the case of a term that the transcript spells', () => {
    const entries = phraseEntries(['Zustand'], pronounce, { source: 'conversation', description: '' })
    const whole = locateTokens(['▁I', '▁use', '▁Zustand', '▁daily'])
    const part = locateTokens(['▁I', '▁use', '▁Zu', 'stand', '▁daily'])

    expect(matchUncertainSpans(whole, [{ kind: 'unstable', tokenStart: 2, tokenEnd: 3, variants: [{ text: 'ZUSTAND', count: 4 }] }], entries, [english])).toEqual([])
    expect(matchUncertainSpans(part, [{ kind: 'unstable', tokenStart: 3, tokenEnd: 4, variants: [{ text: 'STAND', count: 4 }] }], entries, [english])).toEqual([])
  })

  it('reads written forms as whole English words', () => {
    const entries = phraseEntries(['React'], pronounce, { source: 'conversation', description: '' })
    const heardReactor = locateTokens(['▁I', '▁use', '▁Reactor', '▁daily'])
    const heardRactor = locateTokens(['▁I', '▁use', '▁Ractor', '▁daily'])

    const [candidate] = matchUncertainSpans(heardReactor, [{ kind: 'unstable', tokenStart: 2, tokenEnd: 3, variants: [{ text: 'React', count: 4 }] }], entries, [english])
    expect([candidate.span, candidate.score]).toEqual(['Reactor', 1])

    const fromLongerWord = matchUncertainSpans(heardRactor, [{ kind: 'unstable', tokenStart: 2, tokenEnd: 3, variants: [{ text: 'Reactor', count: 4 }] }], entries, [english])
    expect(fromLongerWord.filter(found => found.score === 1)).toEqual([])
  })

  it('places a candidate of a dropped span at its insert position', () => {
    const transcript = locateTokens([...'我遇到了一只'])
    const dropped: UncertainSpan = { kind: 'dropped', tokenStart: 6, tokenEnd: 6, variants: [{ text: '硫方怪', count: 3 }] }

    const [candidate] = matchUncertainSpans(transcript, [dropped], [sulfurCube], [mandarin])

    expect(candidate.score).toBe(1)
    expect([candidate.start, candidate.end]).toEqual([6, 6])
  })
})

describe('boostHotwords', () => {
  const phrases = ['硫方怪', 'Zustand']
  const candidates = () => matchUncertainSpans(mandarinTranscript, [mandarinSpan], phraseEntries(phrases, pronounce, { source: 'conversation', description: '' }), [mandarin, english])

  it('raises only the phrases that sound like an uncertain span', () => {
    const boosts = boostHotwords(phrases, candidates(), { baseScore: 1.5, boostScore: 4 })

    expect(boosts.map(({ phrase, score }) => [phrase, score])).toEqual([['硫方怪', 4], ['Zustand', 1.5]])
    expect(boosts[0].match?.heard).toBe('方')
  })

  it('sends only the matched phrases with the matched scope', () => {
    expect(boostHotwords(phrases, candidates(), { scope: 'matched' }).map(boost => boost.phrase)).toEqual(['硫方怪'])
  })

  it('adds a domain term only through a span match', () => {
    const vocabularyCandidates = matchUncertainSpans(mandarinTranscript, [mandarinSpan], [sulfurCube], [mandarin])

    const boosts = boostHotwords(['Zustand'], [], {}, vocabularyCandidates)

    expect(boosts.map(({ phrase, fromVocabulary }) => [phrase, fromVocabulary])).toEqual([['Zustand', undefined], ['硫方怪', true]])
  })
})

describe('guideCandidates', () => {
  const creeper: PhoneticVocabularyEntry = {
    term: 'Creeper',
    writtenForms: ['苦力怕'],
    pronunciations: [['k', 'ǔ', 'l', 'ì', 'p', 'à']],
    description: 'A green Minecraft mob that explodes near the player.',
    source: 'minecraft-wiki',
  }
  const transcript = locateTokens([...'一只流氓怪和一个酷力爬'])
  const span: UncertainSpan = { kind: 'unstable', tokenStart: 3, tokenEnd: 4, variants: [{ text: '方', count: 4 }] }
  const entries = [sulfurCube, creeper]
  const whole = () => createPhoneticMatcher(entries, [mandarin])(transcript.text)
  const inSpans = () => matchUncertainSpans(transcript, [span], entries, [mandarin])

  it('puts the matches inside uncertain spans first', () => {
    const guided = guideCandidates(whole(), inSpans(), transcript, [span], 'first')

    expect(guided.map(candidate => [candidate.candidate, candidate.backing?.kind])).toEqual([['硫方怪', 'unstable'], ['苦力怕', undefined]])
  })

  it('drops the matches outside the spans with the only scope', () => {
    expect(guideCandidates(whole(), inSpans(), transcript, [span], 'only').map(candidate => candidate.candidate)).toEqual(['硫方怪'])
  })

  it('does not back a word that only ends where speech was dropped', () => {
    const dropped: UncertainSpan = { kind: 'dropped', tokenStart: 5, tokenEnd: 5, variants: [] }

    expect(guideCandidates(whole(), [], transcript, [dropped], 'only')).toEqual([])
  })

  it('keeps the plain phonetic order with uncertainty off', () => {
    expect(guideCandidates(whole(), inSpans(), transcript, [span], 'off')).toEqual(whole())
  })
})

describe('selectGuidedSuggestions', () => {
  it('lets one suggestion claim an insert position', () => {
    const base = { span: '', term: 'x', score: 1, source: 's', description: '' }

    const chosen = selectGuidedSuggestions([
      { ...base, candidate: 'a', start: 4, end: 4 },
      { ...base, candidate: 'b', start: 4, end: 4 },
      { ...base, candidate: 'c', start: 0, end: 2 },
    ])

    expect(chosen.map(candidate => candidate.candidate)).toEqual(['a', 'c'])
  })
})
