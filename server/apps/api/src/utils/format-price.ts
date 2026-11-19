/**
 * Formats a smallest-unit amount into a display price string.
 *
 * @example
 * formatPrice(300, 'usd')
 * // => '$3.00'
 */
export function formatPrice(unitAmount: number | null, currency: string): string {
  if (unitAmount == null)
    return currency.toUpperCase()

  try {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency })
    const fractionDigits = formatter.resolvedOptions().minimumFractionDigits ?? 2
    return formatter.format(unitAmount / (10 ** fractionDigits))
  }
  catch {
    return `${unitAmount / 100} ${currency.toUpperCase()}`
  }
}
