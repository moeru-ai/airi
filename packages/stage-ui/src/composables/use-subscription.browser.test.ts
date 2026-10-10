import type { CustomerInfo, EntitlementInfo } from '@revenuecat/purchases-js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import { useSubscription } from './use-subscription'

const sdk = vi.hoisted(() => ({
  getCustomerInfo: vi.fn<() => Promise<CustomerInfo>>(),
  changeUser: vi.fn(),
  getOfferings: vi.fn(async () => ({ current: null })),
}))

vi.mock('@revenuecat/purchases-js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@revenuecat/purchases-js')>()
  return {
    ...original,
    Purchases: {
      isConfigured: () => true,
      getSharedInstance: () => sdk,
    },
  }
})

function customer(userId: string): CustomerInfo {
  const entitlement: EntitlementInfo = {
    identifier: 'capacitor',
    isActive: true,
    willRenew: true,
    store: 'rc_billing',
    latestPurchaseDate: new Date(),
    originalPurchaseDate: new Date(),
    expirationDate: new Date('2030-01-01'),
    productIdentifier: 'monthly',
    productPlanIdentifier: null,
    unsubscribeDetectedAt: null,
    billingIssueDetectedAt: null,
    isSandbox: true,
    periodType: 'normal',
    ownershipType: 'PURCHASED',
  }
  return {
    entitlements: { active: { capacitor: entitlement }, all: { capacitor: entitlement } },
    allExpirationDatesByProduct: { monthly: entitlement.expirationDate },
    allPurchaseDatesByProduct: { monthly: entitlement.latestPurchaseDate },
    activeSubscriptions: new Set(['monthly']),
    managementURL: `https://example.com/manage/${userId}`,
    requestDate: new Date(),
    firstSeenDate: new Date(),
    originalPurchaseDate: null,
    originalAppUserId: userId,
    nonSubscriptionTransactions: [],
    subscriptionsByProductIdentifier: {},
  }
}

const unmounts: (() => void)[] = []

function mountSubscription() {
  const userId = ref('account-a')
  const holder: { subscription?: ReturnType<typeof useSubscription> } = {}
  const target = document.createElement('div')
  document.body.append(target)
  const app = createApp(defineComponent({
    setup() {
      const subscription = useSubscription({ getUserId: () => userId.value, onChanged: async () => {} })
      holder.subscription = subscription
      return () => subscription.managementUrl.value
        ? h('a', { href: subscription.managementUrl.value }, 'Manage subscription')
        : null
    },
  }))
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  app.mount(target)
  const unmount = () => {
    app.unmount()
    target.remove()
  }
  unmounts.push(unmount)
  if (!holder.subscription)
    throw new Error('Expected subscription to initialize')
  return { subscription: holder.subscription, userId, target, unmount }
}

describe('subscription account ownership', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_REVENUECAT_WEB_KEY', 'public-test-key')
    vi.stubEnv('VITE_DISABLE_FLUX_PURCHASE', 'false')
    sdk.getCustomerInfo.mockResolvedValue(customer('account-a'))
  })

  afterEach(() => {
    unmounts.splice(0).forEach(unmount => unmount())
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  // https://github.com/moeru-ai/airi/pull/2813#discussion_r4237700028
  // ROOT CAUSE:
  // The mounted page retained the previous user's management link.
  // Synchronous identity changes now clear state and invalidate pending responses.
  it('removes the management link when the user logs out without leaving the page', async () => {
    const { subscription, userId, target } = mountSubscription()
    await subscription.fetchStatus()
    await nextTick()
    expect(target.querySelector('a')?.href).toBe('https://example.com/manage/account-a')
    expect(subscription.currentCapacitor.value?.productId).toBe('monthly')
    userId.value = ''
    expect(subscription.currentCapacitor.value).toBeNull()
    expect(subscription.managementUrl.value).toBeNull()
    await nextTick()
    expect(target.querySelector('a')).toBeNull()
  })

  // https://github.com/moeru-ai/airi/pull/2813#discussion_r4237700028
  it('discards an earlier response after the account changes away and back', async () => {
    let complete: (info: CustomerInfo) => void = () => {
      throw new Error('Expected pending request')
    }
    sdk.getCustomerInfo.mockReturnValueOnce(new Promise(resolve => complete = resolve))
    const { subscription, userId } = mountSubscription()
    const pending = subscription.fetchStatus()
    await vi.waitFor(() => expect(sdk.getCustomerInfo).toHaveBeenCalled())
    userId.value = 'account-b'
    userId.value = 'account-a'
    complete(customer('stale-account-a'))
    await pending
    expect(subscription.managementUrl.value).toBeNull()
  })

  // https://github.com/moeru-ai/airi/pull/2813#discussion_r4237700028
  it('does not apply a response after the page unmounts', async () => {
    let complete: (info: CustomerInfo) => void = () => {
      throw new Error('Expected pending request')
    }
    sdk.getCustomerInfo.mockReturnValueOnce(new Promise(resolve => complete = resolve))
    const { subscription, unmount } = mountSubscription()
    const pending = subscription.fetchStatus()
    await vi.waitFor(() => expect(sdk.getCustomerInfo).toHaveBeenCalled())
    unmount()
    unmounts.pop()
    complete(customer('account-a'))
    await pending
    expect(subscription.managementUrl.value).toBeNull()
  })
  // https://github.com/moeru-ai/airi/pull/2813#discussion_r4237747703
  // ROOT CAUSE:
  // fetchStatus suppressed customer errors. It now propagates them to the page.
  it('reports a customer-status failure to the page', async () => {
    sdk.getCustomerInfo.mockRejectedValueOnce(new Error('SDK unavailable'))
    const { subscription } = mountSubscription()
    await expect(subscription.fetchStatus()).rejects.toThrow('SDK unavailable')
  })
})
