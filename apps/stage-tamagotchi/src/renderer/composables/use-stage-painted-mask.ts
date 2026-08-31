import type { NormalizedRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

/**
 * How long one mask serves captures before the stage canvas is read again, in
 * milliseconds.
 *
 * A read costs about 3.4 ms at 20 captures per second, more than everything
 * else in a capture together, and reading a smaller region does not help. The
 * silhouette changes far more slowly than the screen behind it. 250 matches
 * the default capture interval, so the default configuration still reads once
 * per capture.
 */
const paintedAlphaIntervalMs = 250

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
  let cache: { alpha: Uint8ClampedArray, readAt: number, window: NormalizedRectangle } | undefined

  /**
   * The cache answers until {@link paintedAlphaIntervalMs} passes, the window
   * rectangle moves, or the sample grid changes size.
   *
   * @param windowRectangle - The stage window on the sample frame, in frame units.
   * @param now - The capture time, on the same clock across calls.
   */
  function maskFor(windowRectangle: NormalizedRectangle, now: number): Uint8ClampedArray | undefined {
    followSampleGrid()

    const cached = cache
    const fresh = cached !== undefined
      && now - cached.readAt < paintedAlphaIntervalMs
      && cached.alpha.length === canvas.width * canvas.height
      && sameRectangle(cached.window, windowRectangle)
    if (fresh)
      return cached.alpha

    const alpha = readPaintedAlpha(windowRectangle)
    cache = alpha ? { alpha, readAt: now, window: windowRectangle } : undefined
    return alpha
  }

  /** A caller that stops capturing calls this: the window may paint something else before it resumes. */
  function reset() {
    cache = undefined
  }

  /** A mask on any grid but the caller's cannot index the frame. */
  function followSampleGrid() {
    const { width, height } = sources.sampleGrid()
    if (canvas.width === width && canvas.height === height)
      return

    canvas.width = width
    canvas.height = height
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

function sameRectangle(a: NormalizedRectangle, b: NormalizedRectangle) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
