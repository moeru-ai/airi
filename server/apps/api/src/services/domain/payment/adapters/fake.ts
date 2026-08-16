import type { ConfirmationFacts, FluxPack, FluxPackListItem, PaymentProvider, ProviderCreateInput, ProviderCreateResult } from '../types'

export interface FakeConfirmationNative {
  paymentOrderId: string
  providerOrderId: string
  status: ConfirmationFacts['status']
  amount?: number
  currency?: string
  providerCustomerId?: string
}

export function createFakePaymentProvider(options?: {
  onCreate?: (input: ProviderCreateInput) => Promise<void> | void
  redirectUrl?: string
}): PaymentProvider {
  return {
    async create(input: ProviderCreateInput): Promise<ProviderCreateResult> {
      await options?.onCreate?.(input)
      return {
        providerOrderId: `fake_${input.paymentOrderId}`,
        url: options?.redirectUrl ?? `https://fake.pay.test/checkout/${input.paymentOrderId}`,
      }
    },

    async listPackages(packs: FluxPack[]): Promise<FluxPackListItem[]> {
      return packs.map(pack => ({
        packKey: pack.key,
        stripePriceId: pack.providers.stripe?.priceId,
        label: pack.name,
        defaultCurrency: 'usd',
        currencies: { usd: '$5.00' },
        recommended: pack.recommended,
      }))
    },

    confirmed(native: unknown): ConfirmationFacts {
      const value = native as FakeConfirmationNative
      return {
        provider: 'fake',
        paymentOrderId: value.paymentOrderId,
        providerOrderId: value.providerOrderId,
        status: value.status,
        amount: value.amount,
        currency: value.currency,
        providerCustomerId: value.providerCustomerId,
      }
    },

    async cancel() {},

    async getStatus() {
      return null
    },
  }
}
