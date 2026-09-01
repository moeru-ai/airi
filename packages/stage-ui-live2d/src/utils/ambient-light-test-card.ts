/**
 * Fills of the card, in card pixels. Every one is a neutral gray, because a
 * colored fill would mix with the cast the shader adds and hide it. The patch
 * fill carries no alpha, because each patch declares its own.
 */
const bodyColor = '#3c3c42'
const barColor = '#9aa0a8'
const patchColorChannels = '226, 232, 240'
const annotationColor = '#c3c3cc'
const annotationFont = '600 12px ui-sans-serif, system-ui, sans-serif'
const bodyBottom = 236
const bodyRadius = 26

/** Both annotations sit on the body, which is thick enough that no band reaches the text. */
const rampAnnotationBaseline = 66
const groupAnnotationBaseline = 218

/** The bars and the patches share one row below the body. */
const groupTop = 268
const groupHeight = 80

const cardWidth = 480
const cardMargin = 36
const patchWidth = 68

/**
 * The regions of the ambient-light test card, in card pixels.
 *
 * The card is a chart, and each region answers one question about the shader.
 * The drawing, the devtool captions and the browser test all read these
 * numbers, so no description can drift from what the card shows.
 */
export const ambientLightTestCard = {
  /**
   * The card fills the Pixi stage, so these are stage pixels too. Both bands
   * scale with the filter frame height, which keeps every band a fixed
   * fraction of the card however the element is scaled on screen.
   */
  width: cardWidth,
  height: 384,

  /**
   * The blur passes read the alpha outside a silhouette. A shape reaching the
   * canvas edge would read its own alpha past it, and no band would form there.
   */
  margin: cardMargin,

  /**
   * The exposure, the contrast, the cast gain cap and the headroom compression
   * all read as a tone response along this one axis. The body is far wider than
   * the wrap band, so the wrap must not reach the ramp.
   */
  ramp: {
    left: 56,
    top: 76,
    right: 424,
    bottom: 190,
    low: 30,
    high: 245,
  },

  /**
   * The bars show how far a band reaches into a thin shape, and where it covers
   * one outright. `spacing` is the transparent gap between two of them.
   */
  bars: {
    left: 56,
    top: groupTop,
    height: groupHeight,
    spacing: 22,
    widths: [34, 17, 9, 5, 3],
  },

  /**
   * Two patches drawn with partial alpha, which is what the `translucentWrap`
   * option acts on. The second one ends on the right margin.
   */
  patches: [
    { left: 288, top: groupTop, width: patchWidth, height: groupHeight, alpha: 0.5 },
    { left: cardWidth - cardMargin - patchWidth, top: groupTop, width: patchWidth, height: groupHeight, alpha: 0.25 },
  ],
} as const

/**
 * The caller owns the returned canvas and passes it to a texture.
 *
 * @throws when the browser gives no 2D canvas context.
 */
export function drawAmbientLightTestCard(): HTMLCanvasElement {
  const { width, height, margin, ramp, bars, patches } = ambientLightTestCard

  const card = document.createElement('canvas')
  card.width = width
  card.height = height

  const context = card.getContext('2d')
  if (!context)
    throw new Error('The ambient-light shader preview needs a 2D canvas context')

  context.fillStyle = bodyColor
  context.beginPath()
  context.roundRect(margin, margin, width - 2 * margin, bodyBottom - margin, bodyRadius)
  context.fill()

  const rampGradient = context.createLinearGradient(ramp.left, 0, ramp.right, 0)
  rampGradient.addColorStop(0, `rgb(${ramp.low}, ${ramp.low}, ${ramp.low})`)
  rampGradient.addColorStop(1, `rgb(${ramp.high}, ${ramp.high}, ${ramp.high})`)
  context.fillStyle = rampGradient
  context.fillRect(ramp.left, ramp.top, ramp.right - ramp.left, ramp.bottom - ramp.top)

  context.fillStyle = annotationColor
  context.font = annotationFont
  context.fillText(`sRGB ${ramp.low} → ${ramp.high}`, ramp.left, rampAnnotationBaseline)
  context.fillText(`${bars.widths.join(' ')} px`, bars.left, groupAnnotationBaseline)
  context.fillText(
    `alpha ${patches.map(patch => `${patch.alpha * 100}%`).join(' · ')}`,
    patches[0].left,
    groupAnnotationBaseline,
  )

  context.fillStyle = barColor
  let barLeft = bars.left
  for (const barWidth of bars.widths) {
    context.fillRect(barLeft, bars.top, barWidth, bars.height)
    barLeft += barWidth + bars.spacing
  }

  for (const patch of patches) {
    context.fillStyle = `rgba(${patchColorChannels}, ${patch.alpha})`
    context.fillRect(patch.left, patch.top, patch.width, patch.height)
  }

  return card
}
