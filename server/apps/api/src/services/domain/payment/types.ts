export const PAYMENT_PROVIDERS = ['stripe', 'apple_iap', 'steam', 'fake'] as const

export type PaymentProviderName = typeof PAYMENT_PROVIDERS[number]

export const PAYMENT_ORDER_STATUSES = ['pending', 'paid', 'canceled', 'expired'] as const

export type PaymentOrderStatus = typeof PAYMENT_ORDER_STATUSES[number]

export const CONFIRMATION_STATUSES = ['paid', 'canceled', 'expired'] as const

export type ConfirmationStatus = typeof CONFIRMATION_STATUSES[number]

export interface CatalogProviderIds {
  stripe?: { priceId: string }
}

export interface ProviderProductRef {
  provider: PaymentProviderName
  providerProductId: string | number
}

export interface FluxPack {
  key: string
  name: string
  fluxAmount: number
  recommended: boolean
  providers: CatalogProviderIds
}

export interface FluxPackListItem {
  packKey: string
  stripePriceId?: string
  label: string
  defaultCurrency: string
  currencies: Record<string, string>
  recommended: boolean
}

export interface PackStartContext {
  currency?: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  metadata?: Record<string, string>
}

export interface StartPackInput {
  userId: string
  provider: PaymentProviderName
  packKey: string
  startContext: PackStartContext
}

export interface StartPackResult {
  kind: 'redirect'
  url: string
  paymentOrderId: string
}

export interface ConfirmationFacts {
  provider: PaymentProviderName
  paymentOrderId?: string
  providerOrderId: string
  status: ConfirmationStatus
  amount?: number
  currency?: string
  providerCustomerId?: string
  providerData?: Record<string, unknown>
}

export type ApplyConfirmationResult
  = | { applied: true, userId: string, fluxAmount: number, balanceAfter: number }
    | { applied: false }

export interface ProviderCreateInput {
  paymentOrderId: string
  userId: string
  pack: FluxPack
  currency?: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  providerCustomerId?: string | null
  metadata?: Record<string, string>
}

export interface ProviderCreateResult {
  providerOrderId: string
  url: string
  amount?: number
  currency?: string
}

/**
 * Internal Provider seam. Stripe and Fake satisfy this in Phase 1.
 *
 * Channel routes call {@link PaymentProvider.confirmed} after they verify
 * the native payload. CORE calls {@link PaymentProvider.create}.
 */
export interface PaymentProvider {
  create: (input: ProviderCreateInput) => Promise<ProviderCreateResult>
  listPackages: (packs: FluxPack[]) => Promise<FluxPackListItem[]>
  confirmed: (native: unknown) => ConfirmationFacts
  cancel: (input: { providerOrderId: string }) => Promise<void>
  getStatus: (input: { providerOrderId: string }) => Promise<PaymentOrderStatus | null>
}
