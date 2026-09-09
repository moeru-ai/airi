import type { NormalizedRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

import { wholeWindowRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

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
 * Alpha above which a pixel counts towards the subject bounds.
 *
 * The softest edges of a character fade to nothing over several pixels, and a
 * grid this coarse turns that fade into one dim cell. Counting those cells
 * would grow the bounds by a cell on every side for no light in return.
 */
const subjectAlphaFloor = 8

/** What one read of the stage canvas answers with. */
export interface PaintedRead {
  /** One alpha byte per pixel of the sample frame, character and overlays alike. */
  alpha: Uint8ClampedArray
  /** Bounds of what the renderer drew, in window units, overlays left out. */
  subject: NormalizedRectangle
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

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
  let cache: { read: PaintedRead, readAt: number, window: NormalizedRectangle } | undefined

  /**
   * The cache answers until {@link paintedAlphaIntervalMs} passes, the window
   * rectangle moves, or the sample grid changes size.
   *
   * @param windowRectangle - The stage window on the sample frame, in frame units.
   * @param now - The capture time, on the same clock across calls.
   */
  function maskFor(windowRectangle: NormalizedRectangle, now: number): PaintedRead | undefined {
    followSampleGrid()

    const cached = cache
    const fresh = cached !== undefined
      && now - cached.readAt < paintedAlphaIntervalMs
      && cached.read.alpha.length === canvas.width * canvas.height
      && sameRectangle(cached.window, windowRectangle)
    if (fresh)
      return cached.read

    const read = readPaintedAlpha(windowRectangle)
    cache = read ? { read, readAt: now, window: windowRectangle } : undefined
    return read
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
  function readPaintedAlpha(windowRectangle: NormalizedRectangle): PaintedRead | undefined {
    const stageCanvas = sources.stageCanvas?.()
    if (!context || !stageCanvas || stageCanvas.width === 0)
      return undefined

    const left = windowRectangle.x * canvas.width
    const top = windowRectangle.y * canvas.height
    const width = windowRectangle.width * canvas.width
    const height = windowRectangle.height * canvas.height

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(stageCanvas, left, top, width, height)

    // One read, before the overlays go in. Reading again after them would cost a
    // second wait for the GPU, and the subject has to be measured without them:
    // an overlay sits away from the character and would stretch its bounds.
    const painted = context.getImageData(0, 0, canvas.width, canvas.height).data
    const alpha = new Uint8ClampedArray(canvas.width * canvas.height)
    for (let index = 0; index < alpha.length; index += 1)
      alpha[index] = painted[index * 4 + 3]

    const subject = subjectBoundsOf(alpha, left, top, width, height)

    // The overlays join the mask as rectangles in the array, which needs no
    // second read. Window coordinates map onto the window inside the grid.
    const stageWindow = sources.windowSize()
    const windowWidth = Math.max(1, stageWindow.width)
    const windowHeight = Math.max(1, stageWindow.height)
    for (const element of document.querySelectorAll(`[${stageOpaqueAttribute}]`)) {
      const bounds = element.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0)
        continue

      fillRectangle(
        alpha,
        left + (bounds.left / windowWidth) * width,
        top + (bounds.top / windowHeight) * height,
        (bounds.width / windowWidth) * width,
        (bounds.height / windowHeight) * height,
      )
    }

    return { alpha, subject }
  }

  /**
   * Bounds of what the renderer drew, in window units, from the alpha alone.
   *
   * Reading the canvas rather than asking the renderer keeps this independent
   * of what is on the stage: a Live2D model, a VRM, or anything else that
   * leaves pixels behind answers the same way. Nothing drawn returns the whole
   * window, which is the same rectangle the maps used before they were placed
   * around the subject.
   */
  function subjectBoundsOf(
    alpha: Uint8ClampedArray,
    left: number,
    top: number,
    width: number,
    height: number,
  ): NormalizedRectangle {
    const startColumn = Math.max(0, Math.floor(left))
    const startRow = Math.max(0, Math.floor(top))
    const endColumn = Math.min(canvas.width, Math.ceil(left + width))
    const endRow = Math.min(canvas.height, Math.ceil(top + height))

    let minColumn = endColumn
    let minRow = endRow
    let maxColumn = startColumn
    let maxRow = startRow
    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1) {
        if (alpha[row * canvas.width + column] <= subjectAlphaFloor)
          continue

        if (column < minColumn)
          minColumn = column
        if (column > maxColumn)
          maxColumn = column
        if (row < minRow)
          minRow = row
        if (row > maxRow)
          maxRow = row
      }
    }

    if (minColumn > maxColumn || minRow > maxRow)
      return wholeWindowRectangle

    // The grid samples the window coarsely, so the bounds carry a cell of slack
    // on every side. Taking the outer edge of the outermost cell keeps the
    // subject inside its own rectangle.
    return {
      x: clamp01((minColumn - left) / Math.max(1, width)),
      y: clamp01((minRow - top) / Math.max(1, height)),
      width: clamp01((maxColumn + 1 - minColumn) / Math.max(1, width)),
      height: clamp01((maxRow + 1 - minRow) / Math.max(1, height)),
    }
  }

  function fillRectangle(alpha: Uint8ClampedArray, x: number, y: number, width: number, height: number) {
    const startColumn = Math.max(0, Math.floor(x))
    const startRow = Math.max(0, Math.floor(y))
    const endColumn = Math.min(canvas.width, Math.ceil(x + width))
    const endRow = Math.min(canvas.height, Math.ceil(y + height))
    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1)
        alpha[row * canvas.width + column] = 255
    }
  }

  return { maskFor, reset }
}

function sameRectangle(a: NormalizedRectangle, b: NormalizedRectangle) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
