import type { VoiceInfo } from '../providers/types'

import { describe, expect, it } from 'vitest'

import {
  collectVoiceLanguages,
  filterVoicesByLanguage,
  primarySubtag,
  voicesForLanguage,
  voiceSpeaksLanguage,
} from './voice-language'

function voice(id: string, languages: { code: string, title: string }[]): VoiceInfo {
  return {
    id,
    name: id,
    provider: 'test-provider',
    languages,
  }
}

const chineseVoice = voice('huihui', [{ code: 'zh-CN', title: 'Chinese (Mandarin)' }])
const taiwaneseVoice = voice('hanhan', [{ code: 'zh-TW', title: 'Chinese (Taiwan)' }])
const englishVoice = voice('zira', [{ code: 'en-US', title: 'English (United States)' }])
const multilingualVoice = voice('shimmer', [
  { code: 'en-US', title: 'English (United States)' },
  { code: 'ja-JP', title: 'Japanese' },
])
const unknownVoice = voice('custom-clone', [])
const undeterminedVoice = voice('placeholder', [{ code: 'und', title: 'Undetermined' }])

describe('primarySubtag', () => {
  it('keeps the language and drops the region', () => {
    expect(primarySubtag('zh-CN')).toBe('zh')
    expect(primarySubtag('zh_TW')).toBe('zh')
    expect(primarySubtag('JA')).toBe('ja')
  })

  it('returns an empty subtag for missing input', () => {
    expect(primarySubtag('')).toBe('')
    expect(primarySubtag('   ')).toBe('')
  })
})

describe('voiceSpeaksLanguage', () => {
  it('matches a region variant through its primary subtag', () => {
    expect(voiceSpeaksLanguage(taiwaneseVoice, 'zh')).toBe(true)
    expect(voiceSpeaksLanguage(chineseVoice, 'zh')).toBe(true)
  })

  it('matches every voice when no language is selected', () => {
    expect(voiceSpeaksLanguage(englishVoice, '')).toBe(true)
  })

  it('rejects a voice that lists another language', () => {
    expect(voiceSpeaksLanguage(englishVoice, 'ja')).toBe(false)
  })

  it('rejects a voice without language data', () => {
    expect(voiceSpeaksLanguage(unknownVoice, 'ja')).toBe(false)
    expect(voiceSpeaksLanguage(undeterminedVoice, 'ja')).toBe(false)
  })
})

describe('collectVoiceLanguages', () => {
  it('merges region variants into one entry and sorts by code', () => {
    const options = collectVoiceLanguages([englishVoice, chineseVoice, taiwaneseVoice])
    expect(options).toEqual([
      { code: 'en', title: 'English (United States)' },
      { code: 'zh', title: 'Chinese (Mandarin)' },
    ])
  })

  it('keeps the first title for a merged subtag', () => {
    const options = collectVoiceLanguages([taiwaneseVoice, chineseVoice])
    expect(options).toEqual([{ code: 'zh', title: 'Chinese (Taiwan)' }])
  })

  it('lists every language of a multilingual voice', () => {
    const options = collectVoiceLanguages([multilingualVoice])
    expect(options.map(option => option.code)).toEqual(['en', 'ja'])
  })

  it('skips undetermined and missing codes', () => {
    const options = collectVoiceLanguages([unknownVoice, undeterminedVoice, voice('no-title', [{ code: 'ko', title: '' }])])
    expect(options).toEqual([{ code: 'ko', title: 'KO' }])
  })
})

describe('voicesForLanguage', () => {
  it('returns every voice when no language is selected', () => {
    expect(voicesForLanguage([englishVoice, chineseVoice], '')).toHaveLength(2)
  })

  it('keeps only the voices that speak the language', () => {
    expect(voicesForLanguage([englishVoice, chineseVoice, multilingualVoice], 'ja').map(item => item.id))
      .toEqual(['shimmer'])
  })
})

describe('filterVoicesByLanguage', () => {
  const catalog = [englishVoice, chineseVoice, unknownVoice, undeterminedVoice]

  it('returns every voice when no language is selected', () => {
    expect(filterVoicesByLanguage(catalog, '')).toHaveLength(4)
  })

  it('keeps voices without language data so the list never looks empty by accident', () => {
    expect(filterVoicesByLanguage(catalog, 'ja').map(item => item.id))
      .toEqual(['custom-clone', 'placeholder'])
  })
})
