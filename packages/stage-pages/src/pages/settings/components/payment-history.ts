export function formatPaymentAmount(amount: number | null, currency: string | null, processor: string, locale: string): string | null {
  if (amount === null || !currency)
    return null
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code' })
  let storedDecimalPlaces: number
  switch (processor) {
    case 'apple_iap':
      storedDecimalPlaces = 3
      break
    case 'stripe':
      storedDecimalPlaces = ['ISK', 'UGX'].includes(currency.toUpperCase()) ? 2 : formatter.resolvedOptions().maximumFractionDigits ?? 0
      break
    default:
      return null
  }
  return formatter.format(amount / 10 ** storedDecimalPlaces)
}
