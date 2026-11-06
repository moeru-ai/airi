import { describe, expect, it } from 'vitest'

import { detectSpeechLanguage, toSpeechLanguage } from './language'

describe('language selection', () => {
  it('maps BCP 47 codes to primary language subtags', () => {
    expect(toSpeechLanguage('zh-CN')).toBe('zh')
    expect(toSpeechLanguage('cmn-Hans-CN')).toBe('zh')
    expect(toSpeechLanguage('yue-HK')).toBe('zh')
    expect(toSpeechLanguage('en_US')).toBe('en')
    expect(toSpeechLanguage('ko')).toBe('ko')
    expect(toSpeechLanguage('th-TH')).toBe('th')
    expect(toSpeechLanguage(undefined)).toBeUndefined()
  })

  it('reads the script of the words around a formula', () => {
    expect(detectSpeechLanguage('バーゼル問題の結論は')).toBe('ja')
    expect(detectSpeechLanguage('바젤 문제의 결론은')).toBe('ko')
    expect(detectSpeechLanguage('巴塞尔问题的结论是')).toBe('zh')
    expect(detectSpeechLanguage('巴塞尔问题', 'ja')).toBe('ja')
    expect(detectSpeechLanguage('The Basel problem', 'zh')).toBe('en')
    expect(detectSpeechLanguage(' , ', 'ko')).toBe('ko')
    expect(detectSpeechLanguage('')).toBe('en')
  })
})
