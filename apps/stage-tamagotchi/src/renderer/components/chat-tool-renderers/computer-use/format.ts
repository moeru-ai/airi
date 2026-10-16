import type { ComputerUsePoint, ComputerUseRect, ComputerUseSize } from './schemas'

/** A point in logical screen coordinates, for example `(864, 558)`. */
export function pointText(point: ComputerUsePoint) {
  return `(${Math.round(point.x)}, ${Math.round(point.y)})`
}

export function sizeText(size: ComputerUseSize) {
  return `${Math.round(size.width)} × ${Math.round(size.height)}`
}

/** A rectangle as its origin and its size, for example `(0, 0) · 1728 × 1117`. */
export function rectText(rect: ComputerUseRect) {
  return `${pointText(rect.origin)} · ${sizeText(rect.size)}`
}
