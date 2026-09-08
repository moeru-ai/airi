import type { NormalizedRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

import { wholeWindowRectangle } from '@proj-airi/stage-shared/screen-ambient-light'

/** Capture can lag the canvas: retain recent coverage for half a second. */
const paintedHistoryMs = 500
/** Two sample cells cover resampling edges and a changing faint bloom fringe. */
const paintedMargin = 2

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
  let paintedUntil = new Float64Array(0)
  let horizontalUntil = new Float64Array(0)

  /**
   * Reads every captured frame, retaining recent silhouettes in display-grid
   * coordinates. Window moves keep old coverage until capture catches up.
   * The returned binary mask also covers a small resampling/bloom margin.
   * `now` is a monotonic capture timestamp in milliseconds.
   */
  function maskFor(windowRectangle: NormalizedRectangle, now: number): PaintedRead | undefined {
    followSampleGrid()
    const read = readPaintedAlpha(windowRectangle)
    if (!read) {
      reset()
      return undefined
    }
    const painted = read.alpha
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
    return { alpha: painted, subject: read.subject }
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
