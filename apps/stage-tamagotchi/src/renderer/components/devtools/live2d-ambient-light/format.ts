/** Value labels shared by the ambient light devtool sliders. */

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function formatMultiplier(value: number) {
  return `${value.toFixed(2)}×`
}
