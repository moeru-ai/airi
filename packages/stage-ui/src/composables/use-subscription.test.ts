import { describe, expect, it } from 'vitest'

import { capacitorCatalogCopy, currentCapacitorFromCustomerInfo } from './use-subscription'

const metadata = {
  capacitors: {
    'en': {
      airi_go_monthly: { name: 'Go', benefit: 'Chat and speech' },
      airi_plus_monthly: { name: 'Plus', benefit: 'More chat and speech' },
    },
    'zh-Hans': {
      airi_go_monthly: { name: 'Go', benefit: '对话和语音' },
    },
  },
}

describe('currentCapacitorFromCustomerInfo', () => {
  it('returns null when nothing is active', () => {
    expect(currentCapacitorFromCustomerInfo({ entitlements: { active: {} } })).toBeNull()
  })

  it('keeps the entitlement that expires later', () => {
    const capacitor = currentCapacitorFromCustomerInfo({
      entitlements: {
        active: {
          airi_go: {
            identifier: 'airi_go',
            productIdentifier: 'rc_go_monthly',
            expirationDate: new Date('2026-11-01T00:00:00.000Z'),
            willRenew: false,
          },
          airi_plus: {
            identifier: 'airi_plus',
            productIdentifier: 'rc_plus_monthly',
            expirationDate: new Date('2026-12-01T00:00:00.000Z'),
            willRenew: true,
          },
        },
      },
    })
    expect(capacitor).toEqual({
      entitlementId: 'airi_plus',
      productId: 'rc_plus_monthly',
      expiresAt: '2026-12-01T00:00:00.000Z',
      willRenew: true,
    })
  })

  it('prefers a lifetime entitlement', () => {
    const capacitor = currentCapacitorFromCustomerInfo({
      entitlements: {
        active: {
          dated: {
            identifier: 'airi_go',
            productIdentifier: 'rc_go_monthly',
            expirationDate: new Date('2026-12-01T00:00:00.000Z'),
            willRenew: true,
          },
          lifetime: {
            identifier: 'airi_plus',
            productIdentifier: 'rc_plus_lifetime',
            expirationDate: null,
            willRenew: true,
          },
        },
      },
    })
    expect(capacitor).toMatchObject({ entitlementId: 'airi_plus', expiresAt: null })
  })
})

describe('capacitorCatalogCopy', () => {
  it('reads the name and benefit for the current language', () => {
    expect(capacitorCatalogCopy(metadata, 'airi_go_monthly', 'zh-Hans')).toEqual({
      name: 'Go',
      benefit: '对话和语音',
    })
  })

  it('uses the English entry when the current language has no product', () => {
    expect(capacitorCatalogCopy(metadata, 'airi_plus_monthly', 'zh-Hans')).toEqual({
      name: 'Plus',
      benefit: 'More chat and speech',
    })
  })

  it('returns empty copy when neither language has the product', () => {
    expect(capacitorCatalogCopy(metadata, 'airi_go_yearly', 'zh-Hans')).toEqual({
      name: null,
      benefit: null,
    })
  })

  it('returns empty copy when metadata is missing', () => {
    expect(capacitorCatalogCopy(null, 'airi_go_monthly', 'en')).toEqual({
      name: null,
      benefit: null,
    })
  })
})
