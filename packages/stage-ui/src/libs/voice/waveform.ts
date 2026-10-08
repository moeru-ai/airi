/** Bar width and gap in CSS pixels. Bars keep them at any canvas width, so a wider canvas shows more bars. */
export interface WaveformBars {
  width: number
  gap: number
}

/** The live waveform of a recording in progress. */
export const RECORDING_WAVEFORM_BARS: WaveformBars = { width: 3, gap: 2 }
/** A recorded message next to its transcript. Thin bars match the weight of the text. */
export const MESSAGE_WAVEFORM_BARS: WaveformBars = { width: 2, gap: 2 }

/** How many bars fit in `width` CSS pixels. */
export function waveformSlots(width: number, bars: WaveformBars) {
  return Math.max(0, Math.floor((width + bars.gap) / (bars.width + bars.gap)))
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
  bars: WaveformBars,
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
    const barHeight = Math.max(bars.width, level * size.height)
    context.fillStyle = color
    context.globalAlpha = alpha
    context.beginPath()
    context.roundRect(slot * (bars.width + bars.gap), (size.height - barHeight) / 2, bars.width, barHeight, bars.width / 2)
    context.fill()
  }
}
