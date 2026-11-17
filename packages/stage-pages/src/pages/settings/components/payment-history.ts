/**
 * Formats recorded payment amounts. Apple uses milliunits. Stripe uses currency minor units with two documented exceptions.
 * @example formatPaymentAmount(6000, 'usd', 'stripe', 'en') // USD 60.00
 */
export function formatPaymentAmount(amount: number | null, currency: string | null, processor: string, locale: string): string | null {
  if (amount === null || !currency)
    return null
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code' })
  let fractionDigits: number
  switch (processor) {
    case 'apple_iap':
      // https://developer.apple.com/documentation/appstoreserverapi/price
      fractionDigits = 3
      break
    case 'stripe':
      // Stripe keeps ISK and UGX in hundredths: https://docs.stripe.com/currencies#special-cases
      fractionDigits = ['ISK', 'UGX'].includes(currency.toUpperCase()) ? 2 : formatter.resolvedOptions().maximumFractionDigits ?? 0
      break
    default:
      return null
  }
  return formatter.format(amount / 10 ** fractionDigits)
}
