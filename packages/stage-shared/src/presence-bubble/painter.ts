import type { PresenceBubbleContent } from './content'
import type { PresenceBubbleTailSide } from './placement'

import { formatUnreadBadge, presenceBubbleDotPhases } from './content'
import { presenceBubbleTailInset } from './placement'

export interface PresenceBubblePaintOptions {
  /**
   * Device pixels per unit of the coordinate system the caller positions in.
   *
   * The painter draws at this density and reports sizes in caller units, so the
   * adapter places the result without knowing the backing resolution.
   */
  resolution: number
  palette: PresenceBubblePalette
  /** Edge the tail leaves from, so it points back at the head. */
  tailSide?: PresenceBubbleTailSide
}

/** A painted bubble, sized in the caller's coordinate units. */
export interface PresenceBubbleFrame {
  canvas: HTMLCanvasElement
  width: number
  height: number
  /**
   * Point inside the frame that the caller places on the head target: the tail
   * tip for the thinking bubble, and the badge centre for the unread circle.
   */
  anchorX: number
  anchorY: number
  /**
   * Increments whenever the pixels changed. An adapter uploads the texture only
   * when this differs from the revision it last uploaded.
   */
  revision: number
}

/**
 * Room kept around every shape for its shadow, in caller units.
 *
 * A canvas clips a shadow at its edge like any other drawing, so the surface is
 * grown by this on all four sides and the shape is drawn inset by it.
 */
const shadowPadding = 8

/** Drop shadow, matching the lift the controls island buttons already have. */
const shadow = {
  blur: 7,
  offsetY: 2,
  /** Alpha of the shadow colour, which is otherwise the panel's ink. */
  alpha: 0.28,
} as const

/** Panel geometry shared by both kinds of bubble, in caller units. */
const panel = {
  height: 30,
  radius: presenceBubbleTailInset,
  tailWidth: 10,
  tailHeight: 9,
  /** Width when the panel holds the thinking dots. */
  thinkingWidth: 52,
  /** Space either side of the unread text. */
  unreadPaddingX: 11,
  /** Narrowest an unread panel may be, so a single digit still reads as a bubble. */
  unreadMinWidth: 46,
  dotRadius: 3,
  dotGap: 11,
  unreadFontSize: 13,
  /** Space between the mark and the count. */
  unreadMarkGap: 5,
} as const

/**
 * The exclamation mark, drawn rather than typed, in caller units.
 *
 * A glyph brings the typeface's own stroke weight and proportions, which do not
 * match a count set beside it at this size. Drawing the mark keeps the two
 * balanced and keeps it identical on every platform.
 */
const unreadMark = {
  barWidth: 3.2,
  barHeight: 8.6,
  dotRadius: 1.7,
  /** Space between the bar and the dot under it. */
  dotGap: 2.4,
} as const

const unreadMarkWidth = Math.max(unreadMark.barWidth, unreadMark.dotRadius * 2)
const unreadMarkHeight = unreadMark.barHeight + unreadMark.dotGap + unreadMark.dotRadius * 2

/**
 * Colours the bubble is drawn with, resolved from the theme by the caller.
 *
 * A canvas takes values, not classes, so the renderer reads them off elements
 * carrying the project's own utilities and passes the results here. Nothing in
 * this file picks a colour, which is what keeps the bubble on theme when the
 * palette or the primary hue changes.
 */
export interface PresenceBubblePalette {
  /** Panel fill. */
  panel: string
  /** Colour the drop shadow is cast in. */
  shadow: string
  /** Dots inside the panel. */
  ink: string
  /** Unread badge fill. */
  badge: string
  /** Digits on the unread badge. */
  badgeInk: string
}

/**
 * Applies an alpha to a `#rrggbb` colour for use as a canvas fill.
 *
 * @example
 * withAlpha('#334455', 0.28)
 * // => 'rgba(51, 68, 85, 0.28)'
 */
function withAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  if (value.length !== 6)
    return hex

  const channel = (at: number) => Number.parseInt(value.slice(at, at + 2), 16)
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${alpha})`
}

function contentKey(content: PresenceBubbleContent, options: PresenceBubblePaintOptions) {
  const detail = content.kind === 'thinking' ? content.phase : formatUnreadBadge(content.count)
  const palette = Object.values(options.palette).join(',')
  return `${content.kind}:${detail}:${palette}:${options.resolution}:${options.tailSide ?? 'left'}`
}

/**
 * Draws the bubble into a 2D canvas that a renderer uploads as a texture.
 *
 * One painter serves every renderer, so the bubble looks the same on Pixi and on
 * Three and the layout is written once. Canvas 2D also shapes text with the
 * system font stack, which keeps digits, and later CJK, working without shipping
 * a font atlas.
 */
export class PresenceBubblePainter {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private lastKey = ''
  private revision = 0

  constructor(createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {
    this.canvas = createCanvas()
    const context = this.canvas.getContext('2d')
    if (!context)
      throw new Error('[PresenceBubble] 2D canvas context is unavailable.')

    this.context = context
  }

  /**
   * The canvas the painter draws into.
   *
   * A renderer wraps this once as a texture and keeps it for the painter's whole
   * life; every repaint writes to the same element.
   */
  canvasElement() {
    return this.canvas
  }

  /**
   * Repaints only when the visible result would differ, and reports the frame to
   * place. Returns `undefined` when nothing should be drawn.
   */
  paint(content: PresenceBubbleContent | undefined, options: PresenceBubblePaintOptions): PresenceBubbleFrame | undefined {
    if (!content)
      return undefined

    const key = contentKey(content, options)
    if (key === this.lastKey)
      return this.frameFor(content, options)

    this.lastKey = key
    this.revision += 1

    return content.kind === 'thinking'
      ? this.paintThinking(content.phase, options)
      : this.paintUnread(content.count, options)
  }

  private frameFor(content: PresenceBubbleContent, options: PresenceBubblePaintOptions): PresenceBubbleFrame {
    return this.describePanel(this.panelWidth(content, options), options)
  }

  /** Width the count occupies, in caller units. */
  private unreadCountWidth(count: number, options: PresenceBubblePaintOptions) {
    this.context.font = this.unreadFont(options)
    return this.context.measureText(formatUnreadBadge(count)).width / options.resolution
  }

  private panelWidth(content: PresenceBubbleContent, options: PresenceBubblePaintOptions) {
    if (content.kind === 'thinking')
      return panel.thinkingWidth

    const contentWidth = unreadMarkWidth + panel.unreadMarkGap + this.unreadCountWidth(content.count, options)
    return Math.max(panel.unreadMinWidth, contentWidth + panel.unreadPaddingX * 2)
  }

  /** Draws the exclamation mark with its bar centred on `x` and on `centreY`. */
  private drawUnreadMark(x: number, centreY: number, resolution: number) {
    const ctx = this.context
    const barWidth = unreadMark.barWidth * resolution
    const barHeight = unreadMark.barHeight * resolution
    const dotRadius = unreadMark.dotRadius * resolution
    const top = centreY - (unreadMarkHeight * resolution) / 2

    ctx.beginPath()
    // A rounded cap reads as drawn rather than as a clipped rectangle.
    ctx.moveTo(x - barWidth / 2, top + barWidth / 2)
    ctx.arcTo(x - barWidth / 2, top, x, top, barWidth / 2)
    ctx.arcTo(x + barWidth / 2, top, x + barWidth / 2, top + barWidth / 2, barWidth / 2)
    ctx.lineTo(x + barWidth / 2, top + barHeight - barWidth / 2)
    ctx.arcTo(x + barWidth / 2, top + barHeight, x, top + barHeight, barWidth / 2)
    ctx.arcTo(x - barWidth / 2, top + barHeight, x - barWidth / 2, top + barHeight - barWidth / 2, barWidth / 2)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, top + barHeight + unreadMark.dotGap * resolution + dotRadius, dotRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  private describePanel(width: number, options: PresenceBubblePaintOptions): PresenceBubbleFrame {
    const bodyHeight = panel.height + panel.tailHeight
    const tipX = options.tailSide === 'right' ? width - presenceBubbleTailInset : presenceBubbleTailInset
    return {
      canvas: this.canvas,
      width: width + shadowPadding * 2,
      height: bodyHeight + shadowPadding * 2,
      anchorX: tipX + shadowPadding,
      anchorY: bodyHeight + shadowPadding,
      revision: this.revision,
    }
  }

  private unreadFont(options: PresenceBubblePaintOptions) {
    return `700 ${panel.unreadFontSize * options.resolution}px system-ui, -apple-system, "Segoe UI", sans-serif`
  }

  private resize(width: number, height: number, resolution: number) {
    // Writing width or height reallocates and clears the backing store, so this
    // doubles as the clear between frames.
    this.canvas.width = Math.ceil(width * resolution)
    this.canvas.height = Math.ceil(height * resolution)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /** Lays the shadow under the next fill, and clears it again for what follows. */
  private withShadow(colour: string, resolution: number, draw: () => void) {
    const ctx = this.context
    ctx.save()
    ctx.shadowColor = colour
    ctx.shadowBlur = shadow.blur * resolution
    ctx.shadowOffsetY = shadow.offsetY * resolution
    draw()
    ctx.restore()
  }

  /**
   * Traces the panel and its tail as one path.
   *
   * One shape for both kinds, so an unread count reads as the character's own
   * bubble rather than as a notification badge stuck to its head. The tail is
   * part of the path, so the shadow falls around the whole silhouette instead of
   * seaming where the tail meets the panel.
   */
  private tracePanel(width: number, resolution: number) {
    const ctx = this.context
    const panelWidth = width * resolution
    const panelHeight = panel.height * resolution
    const tailWidth = panel.tailWidth * resolution
    const tailHeight = panel.tailHeight * resolution
    const radius = panel.radius * resolution

    ctx.beginPath()
    ctx.moveTo(radius, 0)
    ctx.lineTo(panelWidth - radius, 0)
    ctx.arcTo(panelWidth, 0, panelWidth, radius, radius)
    ctx.lineTo(panelWidth, panelHeight - radius)
    ctx.arcTo(panelWidth, panelHeight, panelWidth - radius, panelHeight, radius)
    ctx.lineTo(radius + tailWidth, panelHeight)
    ctx.lineTo(radius, panelHeight + tailHeight)
    ctx.lineTo(radius, panelHeight)
    ctx.arcTo(0, panelHeight, 0, panelHeight - radius, radius)
    ctx.lineTo(0, radius)
    ctx.arcTo(0, 0, radius, 0, radius)
    ctx.closePath()
  }

  /**
   * Prepares the canvas and draws the filled panel, leaving the context placed
   * so callers draw their contents in panel coordinates.
   */
  private beginPanel(content: PresenceBubbleContent, options: PresenceBubblePaintOptions) {
    const width = this.panelWidth(content, options)
    const frame = this.describePanel(width, options)
    const { resolution } = options

    this.resize(frame.width, frame.height, resolution)

    const ctx = this.context
    ctx.save()
    // The panel is symmetric, so a tail on the other side is the same drawing
    // flipped. Mirroring here keeps one path rather than two that can drift.
    if (options.tailSide === 'right') {
      ctx.translate(frame.width * resolution, 0)
      ctx.scale(-1, 1)
    }
    ctx.translate(shadowPadding * resolution, shadowPadding * resolution)

    this.tracePanel(width, resolution)

    // Depth comes from the shadow alone. An outline at this size reads as a hard
    // edge against the character rather than as a raised surface.
    this.withShadow(withAlpha(options.palette.shadow, shadow.alpha), resolution, () => {
      ctx.fillStyle = content.kind === 'unread' ? options.palette.badge : options.palette.panel
      ctx.fill()
    })

    return { frame, width: width * resolution, height: panel.height * resolution }
  }

  private paintThinking(phase: number, options: PresenceBubblePaintOptions): PresenceBubbleFrame {
    const content: PresenceBubbleContent = { kind: 'thinking', phase }
    const { frame, width, height } = this.beginPanel(content, options)
    const ctx = this.context
    const { resolution } = options

    const dotRadius = panel.dotRadius * resolution
    const dotGap = panel.dotGap * resolution
    const firstX = width / 2 - dotGap

    for (let index = 0; index < 3; index++) {
      // Each dot leads the next by a third of the cycle, so the three read as one
      // travelling pulse rather than three independent blinks.
      const offset = (phase / presenceBubbleDotPhases + index / 3) % 1
      const lift = Math.sin(offset * Math.PI * 2)
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, lift)
      ctx.beginPath()
      ctx.arc(firstX + dotGap * index, height / 2 - lift * dotRadius * 0.6, dotRadius, 0, Math.PI * 2)
      ctx.fillStyle = options.palette.ink
      ctx.fill()
    }

    ctx.globalAlpha = 1
    ctx.restore()

    return frame
  }

  private paintUnread(count: number, options: PresenceBubblePaintOptions): PresenceBubbleFrame {
    const content: PresenceBubbleContent = { kind: 'unread', count }
    const { frame, width, height } = this.beginPanel(content, options)
    const ctx = this.context

    // Mirrored panels flip their contents too, so the text is flipped back.
    if (options.tailSide === 'right') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }

    const { resolution } = options
    const countWidth = this.unreadCountWidth(count, options) * resolution
    const markWidth = unreadMarkWidth * resolution
    const gap = panel.unreadMarkGap * resolution
    const startX = (width - (markWidth + gap + countWidth)) / 2

    ctx.fillStyle = options.palette.badgeInk
    this.drawUnreadMark(startX + markWidth / 2, height / 2, resolution)

    ctx.font = this.unreadFont(options)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(formatUnreadBadge(count), startX + markWidth + gap, height / 2)
    ctx.restore()

    return frame
  }
}
