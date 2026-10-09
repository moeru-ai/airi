import { describe, expect, it } from 'vitest'

import { currentPlanFromCustomerInfo, planCatalogCopy } from './use-subscription'

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

function entitlement(input: {
  identifier: string
  productIdentifier: string
  expirationDate: Date | null
  willRenew: boolean
}) {
  return input
}

describe('currentPlanFromCustomerInfo', () => {
  it('returns null when nothing is active', () => {
    expect(currentPlanFromCustomerInfo({ entitlements: { active: {} } })).toBeNull()
  })

  it('keeps the entitlement that expires later', () => {
    const plan = currentPlanFromCustomerInfo({
      entitlements: {
        active: {
          airi_go: entitlement({
            identifier: 'airi_go',
            productIdentifier: 'rc_go_monthly',
            expirationDate: new Date('2026-11-01T00:00:00.000Z'),
            willRenew: false,
          }),
          airi_plus: entitlement({
            identifier: 'airi_plus',
            productIdentifier: 'rc_plus_monthly',
            expirationDate: new Date('2026-12-01T00:00:00.000Z'),
            willRenew: true,
          }),
        },
      },
    })
    expect(plan).toEqual({
      entitlementId: 'airi_plus',
      productId: 'rc_plus_monthly',
      expiresAt: '2026-12-01T00:00:00.000Z',
      willRenew: true,
    })
  })

  it('prefers a lifetime entitlement', () => {
    const plan = currentPlanFromCustomerInfo({
      entitlements: {
        active: {
          dated: entitlement({
            identifier: 'airi_go',
            productIdentifier: 'rc_go_monthly',
            expirationDate: new Date('2026-12-01T00:00:00.000Z'),
            willRenew: true,
          }),
          lifetime: entitlement({
            identifier: 'airi_plus',
            productIdentifier: 'rc_plus_lifetime',
            expirationDate: null,
            willRenew: true,
          }),
        },
      },
    })
    expect(plan).toMatchObject({ entitlementId: 'airi_plus', expiresAt: null })
  })
})

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
