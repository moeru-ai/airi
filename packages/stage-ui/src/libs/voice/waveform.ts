/** Bars keep this width and gap at any canvas width. A wider canvas shows more bars, not wider ones. */
export const WAVEFORM_BAR_WIDTH = 3
export const WAVEFORM_BAR_GAP = 2

/** How many bars fit in `width` CSS pixels. */
export function waveformSlots(width: number) {
  return Math.max(0, Math.floor((width + WAVEFORM_BAR_GAP) / (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP)))
}

/**
 * Splits samples into `count` buckets and returns each bucket's peak, scaled so the loudest bucket is 1.
 * Silence stays 0.
 *
 * @example
 * waveformPeaks(new Float32Array([0, 0.5, 0, 0.25]), 2)
 * // => [1, 0.5]
 */
export function waveformPeaks(samples: Float32Array, count: number): number[] {
  if (count <= 0 || !samples.length)
    return Array.from<number>({ length: Math.max(0, count) }).fill(0)

  const peaks = Array.from({ length: count }, (_, bucket) => {
    const start = Math.floor(bucket * samples.length / count)
    const end = Math.max(start + 1, Math.floor((bucket + 1) * samples.length / count))
    let peak = 0
    for (let index = start; index < end && index < samples.length; index++)
      peak = Math.max(peak, Math.abs(samples[index]))
    return peak
  })
  const loudest = Math.max(...peaks)
  return loudest > 0 ? peaks.map(peak => peak / loudest) : peaks
}

/**
 * Draws one rounded bar per level from the left edge of a canvas with `width` × `height` CSS pixels.
 * A level of 0 keeps a dot, so silence still reads as a waveform. `paint` picks the color and opacity of each bar.
 */
export function drawWaveformBars(
  canvas: HTMLCanvasElement,
  size: { width: number, height: number },
  levels: readonly number[],
  paint: (slot: number, level: number) => { color: string, alpha: number },
) {
  const context = canvas.getContext('2d')
  if (!context || !size.width || !size.height)
    return

  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(size.width * ratio)
  canvas.height = Math.round(size.height * ratio)
  context.scale(ratio, ratio)

  for (const [slot, level] of levels.entries()) {
    const { color, alpha } = paint(slot, level)
    const barHeight = Math.max(WAVEFORM_BAR_WIDTH, level * size.height)
    context.fillStyle = color
    context.globalAlpha = alpha
    context.beginPath()
    context.roundRect(slot * (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP), (size.height - barHeight) / 2, WAVEFORM_BAR_WIDTH, barHeight, WAVEFORM_BAR_WIDTH / 2)
    context.fill()
  }
}
