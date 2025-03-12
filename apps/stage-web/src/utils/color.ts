/**
 * Converts a hex color code to OKLCH color space.
 *
 * The conversion follows these steps:
 * 1. Convert hex to RGB (0-1 range)
 * 2. Convert RGB to linear RGB (removing gamma correction)
 * 3. Convert linear RGB to XYZ using standard matrix
 * 4. Convert XYZ to Lab
 * 5. Convert Lab to LCH
 *
 * @param hex - The hex color code (with or without leading #)
 * @returns Object containing L (lightness), C (chroma), H (hue) values
 */
export function hexToOklch(hex: string): { l: number, c: number, h: number } {
  // Remove # if present
  hex = hex.replace('#', '')

  // Convert hex to RGB (0-1 range)
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255

  // Convert RGB to linear RGB (removing gamma correction)
  const linearR = r <= 0.04045 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4
  const linearG = g <= 0.04045 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4
  const linearB = b <= 0.04045 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4

  // Convert linear RGB to XYZ using standard conversion matrix
  const x = linearR * 0.4124564 + linearG * 0.3575761 + linearB * 0.1804375
  const y = linearR * 0.2126729 + linearG * 0.7151522 + linearB * 0.0721750
  const z = linearR * 0.0193339 + linearG * 0.1191920 + linearB * 0.9503041

  // Constants for XYZ to Lab conversion
  const e = 0.008856 // Actual: (6/29)^3
  const k = 903.3 // Actual: (29/3)^3
  const xn = 0.95047 // Reference white D65
  const yn = 1.0
  const zn = 1.08883

  // Convert XYZ to Lab using reference white point D65
  const fx = x / xn > e ? (x / xn) ** (1 / 3) : (k * x / xn + 16) / 116
  const fy = y / yn > e ? (y / yn) ** (1 / 3) : (k * y / yn + 16) / 116
  const fz = z / zn > e ? (z / zn) ** (1 / 3) : (k * z / zn + 16) / 116

  // Calculate Lab values
  const l = 116 * fy - 16
  const a = 500 * (fx - fy)
  const b2 = 200 * (fy - fz)

  // Convert Lab to LCH
  const c = Math.sqrt(a * a + b2 * b2)
  let h = Math.atan2(b2, a) * (180 / Math.PI)

  // Ensure hue is positive
  if (h < 0)
    h += 360

  return { l, c, h }
}
