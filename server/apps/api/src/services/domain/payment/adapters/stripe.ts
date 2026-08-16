import type Stripe from 'stripe'

import type { ConfigKVService } from '../../../adapters/config-kv'
import type { ConfirmationFacts, FluxPack, FluxPackListItem, PaymentProvider, ProviderCreateInput, ProviderCreateResult } from '../types'

import { useLogger } from '@guiiai/logg'

import { createServiceUnavailableError } from '../../../../utils/error'

const logger = useLogger('payment.stripe')

type CheckoutSessionCreateParams = NonNullable<Parameters<Stripe['checkout']['sessions']['create']>[0]>

/**
 * Stripe adapter for the Payment Provider port.
 *
 * Checkout create and native-to-facts mapping live here. Signature verify and
 * Customer Portal stay in the Stripe route.
 */
export function createStripePaymentProvider(
  stripe: Stripe | null,
  configKV: ConfigKVService,
): PaymentProvider {
  return {
    async listPackages(packs: FluxPack[]): Promise<FluxPackListItem[]> {
      if (!stripe)
        return []

      const items: FluxPackListItem[] = []
      for (const pack of packs) {
        const priceId = pack.providers.stripe?.priceId
        if (!priceId)
          continue

        let price: Stripe.Price
        try {
          price = await stripe.prices.retrieve(priceId, { expand: ['currency_options'] })
        }
        catch (error) {
          logger.withError(error).withFields({ priceId, packKey: pack.key }).warn('Stripe price lookup skipped')
          continue
        }

        const currencies: Record<string, string> = {}
        currencies[price.currency] = formatPrice(price.unit_amount, price.currency)
        for (const [currency, option] of Object.entries(price.currency_options ?? {})) {
          currencies[currency] = formatPrice(option.unit_amount, currency)
        }

        items.push({
          packKey: pack.key,
          stripePriceId: price.id,
          label: pack.name,
          defaultCurrency: price.currency,
          currencies,
          recommended: pack.recommended,
        })
      }

      return items
    },

    async create(input: ProviderCreateInput): Promise<ProviderCreateResult> {
      if (!stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const priceId = input.pack.providers.stripe?.priceId
      if (!priceId)
        throw createServiceUnavailableError('Stripe pack mapping is missing', 'STRIPE_PACK_NOT_MAPPED', { packKey: input.pack.key })

      const paymentMethods = await configKV.getOptional('STRIPE_PAYMENT_METHODS')
      const paymentMethodOptions = await configKV.getOptional('STRIPE_PAYMENT_METHOD_OPTIONS') ?? {}

      const sessionParams: CheckoutSessionCreateParams = {
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        allow_promotion_codes: true,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        customer: input.providerCustomerId ?? undefined,
        customer_email: input.providerCustomerId ? undefined : input.customerEmail,
        metadata: {
          payment_order_id: input.paymentOrderId,
          userId: input.userId,
          packKey: input.pack.key,
          fluxAmount: String(input.pack.fluxAmount),
          ...input.metadata,
        },
      }

      if (paymentMethods)
        sessionParams.payment_method_types = paymentMethods as CheckoutSessionCreateParams['payment_method_types']

      if (Object.keys(paymentMethodOptions).length > 0)
        sessionParams.payment_method_options = paymentMethodOptions as CheckoutSessionCreateParams['payment_method_options']

      if (input.currency)
        sessionParams.currency = input.currency

      const session = await stripe.checkout.sessions.create(sessionParams)
      if (!session.url)
        throw createServiceUnavailableError('Stripe checkout did not return a URL', 'STRIPE_CHECKOUT_URL_MISSING')

      return {
        providerOrderId: session.id,
        url: session.url,
        amount: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
      }
    },

    confirmed(native: unknown): ConfirmationFacts {
      const session = native as Stripe.Checkout.Session
      const providerCustomerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id

      const status = session.status === 'expired' ? 'expired' : 'paid'

      return {
        provider: 'stripe',
        paymentOrderId: session.metadata?.payment_order_id || undefined,
        providerOrderId: session.id,
        status,
        amount: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        providerCustomerId,
        providerData: {
          sessionId: session.id,
          customerId: providerCustomerId,
          paymentIntentId: typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id,
          mode: session.mode,
          paymentStatus: session.payment_status,
        },
      }
    },

    async cancel(input) {
      if (!stripe)
        return

      try {
        await stripe.checkout.sessions.expire(input.providerOrderId)
      }
      catch (error) {
        logger.withError(error).withFields({ providerOrderId: input.providerOrderId }).warn('Stripe checkout expire skipped')
      }
    },

    async getStatus() {
      return null
    },
  }
}

/**
 * Formats a Stripe smallest-unit amount into a display price string.
 *
 * @example
 * formatPrice(300, 'usd') // => '$3.00'
 * formatPrice(500, 'jpy') // => '¥500'
 */
function formatPrice(unitAmount: number | null, currency: string): string {
  if (unitAmount == null)
    return currency.toUpperCase()

  try {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency })
    const fractionDigits = formatter.resolvedOptions().minimumFractionDigits ?? 2
    const amount = unitAmount / (10 ** fractionDigits)
    return formatter.format(amount)
  }
  catch {
    return `${unitAmount / 100} ${currency.toUpperCase()}`
  }
}
