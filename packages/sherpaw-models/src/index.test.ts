import { describe, expect, it } from 'vitest'

import { formatSherpawModelName, paraformerBilingualZhEn, zipformerMultilingual } from './index'

describe('sherpaw model catalogue', () => {
  it('keeps the model name separate from its localized language list', () => {
    expect(paraformerBilingualZhEn.name).toBe('Paraformer')
    expect(formatSherpawModelName(paraformerBilingualZhEn, 'en')).toBe('Paraformer — Chinese, English')
    expect(formatSherpawModelName(paraformerBilingualZhEn, 'zh-Hans')).toBe('Paraformer — 中文, 英语')
  })

  it('declares every language supported by the multilingual model', () => {
    expect(zipformerMultilingual.supportedLanguages).toEqual(['ar', 'en', 'id', 'ja', 'ru', 'th', 'vi', 'zh'])
  })
})
