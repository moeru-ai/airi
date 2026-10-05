import { describe, expect, it } from 'vitest'

import { planCatalogCopy } from './use-subscription'

const metadata = {
  plans: {
    'en': {
      airi_go_monthly: { name: 'Go', benefit: 'Chat and speech' },
      airi_plus_monthly: { name: 'Plus', benefit: 'More chat and speech' },
    },
    'zh-Hans': {
      airi_go_monthly: { name: 'Go', benefit: '对话和语音' },
    },
  },
}

describe('planCatalogCopy', () => {
  it('reads the name and benefit for the current language', () => {
    expect(planCatalogCopy(metadata, 'airi_go_monthly', 'zh-Hans')).toEqual({
      name: 'Go',
      benefit: '对话和语音',
    })
  })

  it('uses the English entry when the current language has no product', () => {
    expect(planCatalogCopy(metadata, 'airi_plus_monthly', 'zh-Hans')).toEqual({
      name: 'Plus',
      benefit: 'More chat and speech',
    })
  })

  it('returns empty copy when neither language has the product', () => {
    expect(planCatalogCopy(metadata, 'airi_go_yearly', 'zh-Hans')).toEqual({
      name: null,
      benefit: null,
    })
  })

  it('returns empty copy when metadata is missing', () => {
    expect(planCatalogCopy(null, 'airi_go_monthly', 'en')).toEqual({
      name: null,
      benefit: null,
    })
  })
})
