import type { NormalizedRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

/** Capture can lag the canvas: retain recent coverage for half a second. */
const paintedHistoryMs = 500
/** Two sample cells cover resampling edges and a changing faint bloom fringe. */
const paintedMargin = 2

/** Marks a DOM element as something AIRI paints over the stage window. */
export const stageOpaqueAttribute = 'data-ambient-light-opaque'

/**
 * Reports which pixels of the stage window AIRI paints, one alpha byte per
 * pixel of the screen sample frame.
 *
 * The screen sampler subtracts this mask, so that it measures the desktop
 * behind the window instead of AIRI's own output. Two things need covering:
 * the character, whose exact silhouette including soft edges comes from the
 * stage canvas, and the overlays, which are plain DOM and count as rectangles.
 */
export function useStagePaintedMask(sources: {
  /** The canvas the character renders into. Without it there is no mask. */
  stageCanvas?: () => HTMLCanvasElement | undefined
  /** Size of the sample frame, in pixels. The mask comes back on this grid. */
  sampleGrid: () => { width: number, height: number }
  /** Size of the stage window, in CSS pixels, which is what overlays report their bounds in. */
  windowSize: () => { width: number, height: number }
}) {
  // Separate from the sample canvas, so that reading one does not force a read
  // of the other.
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let paintedUntil = new Float64Array(0)
  let horizontalUntil = new Float64Array(0)

  /**
   * Reads every captured frame, retaining recent silhouettes in display-grid
   * coordinates. Window moves keep old coverage until capture catches up.
   * The returned binary mask also covers a small resampling/bloom margin.
   * `now` is a monotonic capture timestamp in milliseconds.
   */
  function maskFor(windowRectangle: NormalizedRectangle, now: number): Uint8ClampedArray | undefined {
    followSampleGrid()
    const painted = readPaintedAlpha(windowRectangle)
    if (!painted) {
      reset()
      return undefined
    }
    const { width, height } = canvas
    for (let i = 0; i < painted.length; i++) {
      if (painted[i] > 0)
        paintedUntil[i] = now + paintedHistoryMs
    }
    // Separable maximum filter expands the union of recent silhouettes. Work
    // stays proportional to the small sample grid, not the full stage canvas.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let until = 0
        for (let dx = Math.max(0, x - paintedMargin); dx <= Math.min(width - 1, x + paintedMargin); dx++)
          until = Math.max(until, paintedUntil[y * width + dx])
        horizontalUntil[y * width + x] = until
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let until = 0
        for (let dy = Math.max(0, y - paintedMargin); dy <= Math.min(height - 1, y + paintedMargin); dy++)
          until = Math.max(until, horizontalUntil[dy * width + x])
        painted[y * width + x] = until > now ? 255 : 0
      }
    }
    return painted
  }

  /** Capture stop or display changes invalidate the display-grid history. */
  function reset() {
    paintedUntil.fill(0)
  }

  /** A mask on any grid but the caller's cannot index the frame. */
  function followSampleGrid() {
    const { width, height } = sources.sampleGrid()
    if (canvas.width === width && canvas.height === height)
      return

    canvas.width = width
    canvas.height = height
    paintedUntil = new Float64Array(width * height)
    horizontalUntil = new Float64Array(width * height)
  }

  /**
   * Missing either part biases the measurement: the character feeds the filter
   * its own output, and an overlay feeds it AIRI's interface colors.
   */
  function readPaintedAlpha(windowRectangle: NormalizedRectangle): Uint8ClampedArray | undefined {
    const stageCanvas = sources.stageCanvas?.()
    if (!context || !stageCanvas || stageCanvas.width === 0)
      return undefined

    const left = windowRectangle.x * canvas.width
    const top = windowRectangle.y * canvas.height
    const width = windowRectangle.width * canvas.width
    const height = windowRectangle.height * canvas.height

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(stageCanvas, left, top, width, height)

    // Window coordinates map to the window rectangle inside the sample grid.
    const stageWindow = sources.windowSize()
    const windowWidth = Math.max(1, stageWindow.width)
    const windowHeight = Math.max(1, stageWindow.height)
    context.fillStyle = '#fff'
    for (const element of document.querySelectorAll(`[${stageOpaqueAttribute}]`)) {
      const bounds = element.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0)
        continue
      context.fillRect(
        left + (bounds.left / windowWidth) * width,
        top + (bounds.top / windowHeight) * height,
        (bounds.width / windowWidth) * width,
        (bounds.height / windowHeight) * height,
      )
    }

    const painted = context.getImageData(0, 0, canvas.width, canvas.height).data
    const alpha = new Uint8ClampedArray(canvas.width * canvas.height)
    for (let index = 0; index < alpha.length; index += 1)
      alpha[index] = painted[index * 4 + 3]

    return alpha
  }

  return { maskFor, reset }
}
