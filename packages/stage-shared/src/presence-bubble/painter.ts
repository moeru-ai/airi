import type { PresenceBubbleContent } from './content'

import { formatUnreadBadge, presenceBubbleDotPhases } from './content'

export interface PresenceBubblePaintOptions {
  /**
   * Device pixels per unit of the coordinate system the caller positions in.
   *
   * The painter draws at this density and reports sizes in caller units, so the
   * adapter places the result without knowing the backing resolution.
   */
  resolution: number
  palette: PresenceBubblePalette
  /**
   * Where the head is, in the panel's own coordinates.
   *
   * The tail is aimed at it. Omitted, the panel is drawn without one.
   */
  tailTarget?: PresenceBubblePoint
}

/** A painted bubble, sized in the caller's coordinate units. */
export interface PresenceBubbleFrame {
  canvas: HTMLCanvasElement
  /** Size of the drawn surface, which holds the shadow and the tail too. */
  width: number
  height: number
  /**
   * Size of the panel alone.
   *
   * What a caller places: the surface is larger by the room the shadow and the
   * tail need, and treating that as the bubble's size pushes it away from the
   * character by the padding.
   */
  panelWidth: number
  panelHeight: number
  /**
   * How far the tail reaches past the panel.
   *
   * A caller adds this to the distance it keeps from the head, so the tail has
   * somewhere to span. Without it the panel sits against the head and the tail
   * is drawn straight into it.
   */
  tailReach: number
  /**
   * The panel's top left inside the drawn surface.
   *
   * What a caller places. The surface is padded on every side for the shadow and
   * the tail, so its own corner is not the panel's.
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

/**
 * Room kept around the panel for everything drawn outside it, in caller units.
 *
 * The tail leaves from whichever side faces the head, so the room has to be on
 * every side rather than under the panel alone.
 */
const surfacePadding = shadowPadding + 11

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
  radius: 15,
  tailWidth: 10,
  tailHeight: 9,
  /** Width when the panel holds the thinking dots. */
  thinkingWidth: 52,
  /** How far the tail reaches past the panel, at most. */
  tailReach: 11,
  /** Half the width of the tail where it meets the panel. */
  tailBase: 6,
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
/** A point in the panel's own coordinates, measured from its top left. */
export interface PresenceBubblePoint {
  x: number
  y: number
}

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
  const detail = content.kind === 'thinking' ? `${content.phase}:${content.animated}` : formatUnreadBadge(content.count)
  const palette = Object.values(options.palette).join(',')
  // The tail is redrawn when it would visibly move, not on every sub-pixel of
  // head motion the spring smooths away.
  const target = options.tailTarget
    ? `${Math.round(options.tailTarget.x / 2)},${Math.round(options.tailTarget.y / 2)}`
    : 'none'
  return `${content.kind}:${detail}:${palette}:${options.resolution}:${target}`
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
   * Reports the frame this content would occupy, without drawing it.
   *
   * A caller needs the panel's size to decide where it goes, and the tail is
   * aimed from there. Measuring first keeps that to one drawing per frame, so
   * the panel and the tail always come from the same numbers.
   */
  measure(content: PresenceBubbleContent | undefined, options: PresenceBubblePaintOptions) {
    if (!content)
      return undefined

    return this.frameFor(content, options)
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
      ? this.paintThinking(content.phase, content.animated, options)
      : this.paintUnread(content.count, options)
  }

  private frameFor(content: PresenceBubbleContent, options: PresenceBubblePaintOptions): PresenceBubbleFrame {
    return this.describePanel(this.panelWidth(content, options))
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

  private describePanel(width: number): PresenceBubbleFrame {
    return {
      canvas: this.canvas,
      width: width + surfacePadding * 2,
      height: panel.height + surfacePadding * 2,
      panelWidth: width,
      panelHeight: panel.height,
      tailReach: panel.tailReach,
      anchorX: surfacePadding,
      anchorY: surfacePadding,
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
   * Walks the panel's outline, in device pixels, clockwise from the top edge.
   *
   * @param distance - How far along the outline, wrapping at its length.
   */
  private outlinePointAt(distance: number, width: number, height: number, radius: number) {
    const straightX = width - radius * 2
    const straightY = height - radius * 2
    const corner = radius * Math.PI / 2
    const perimeter = straightX * 2 + straightY * 2 + corner * 4

    let along = distance % perimeter
    if (along < 0)
      along += perimeter

    const onArc = (centreX: number, centreY: number, from: number, travelled: number) => {
      const angle = from + travelled / radius
      return { x: centreX + Math.cos(angle) * radius, y: centreY + Math.sin(angle) * radius }
    }

    if (along < straightX)
      return { x: radius + along, y: 0 }
    along -= straightX

    if (along < corner)
      return onArc(width - radius, radius, -Math.PI / 2, along)
    along -= corner

    if (along < straightY)
      return { x: width, y: radius + along }
    along -= straightY

    if (along < corner)
      return onArc(width - radius, height - radius, 0, along)
    along -= corner

    if (along < straightX)
      return { x: width - radius - along, y: height }
    along -= straightX

    if (along < corner)
      return onArc(radius, height - radius, Math.PI / 2, along)
    along -= corner

    if (along < straightY)
      return { x: 0, y: height - radius - along }
    along -= straightY

    return onArc(radius, radius, Math.PI, along)
  }

  /**
   * Traces the panel and its tail as one outline.
   *
   * The tail is part of the boundary rather than a second shape laid over it:
   * the walk around the panel leaves the outline at the tail's root, goes out to
   * the tip, and rejoins. Nothing can come apart, because there is no join.
   */
  private tracePanel(width: number, target: PresenceBubblePoint | undefined, resolution: number) {
    const ctx = this.context
    const panelWidth = width * resolution
    const panelHeight = panel.height * resolution
    const radius = Math.min(panel.radius * resolution, panelHeight / 2, panelWidth / 2)

    const straightX = panelWidth - radius * 2
    const straightY = panelHeight - radius * 2
    const perimeter = straightX * 2 + straightY * 2 + radius * Math.PI * 2
    const step = Math.max(1, perimeter / 160)

    const centreX = panelWidth / 2
    const centreY = panelHeight / 2
    const toTargetX = target ? target.x * resolution - centreX : 0
    const toTargetY = target ? target.y * resolution - centreY : 0
    const distance = Math.hypot(toTargetX, toTargetY)

    const point = (at: number) => this.outlinePointAt(at, panelWidth, panelHeight, radius)

    // A target inside the panel gives no direction to leave along, so the panel
    // is drawn closed.
    if (!target || distance < radius) {
      ctx.beginPath()
      for (let at = 0; at < perimeter; at += step) {
        const { x, y } = point(at)
        if (at === 0)
          ctx.moveTo(x, y)
        else
          ctx.lineTo(x, y)
      }
      ctx.closePath()
      return
    }

    const direction = Math.atan2(toTargetY, toTargetX)

    // The outline is convex and wraps the centre once, so the angle it is seen
    // at rises with the walk. Scanning for the closest angle finds where the
    // tail belongs, on the outline itself rather than on a rectangle around it.
    let exitAt = 0
    let closest = Number.POSITIVE_INFINITY
    for (let at = 0; at < perimeter; at += step) {
      const { x, y } = point(at)
      const difference = Math.abs(Math.atan2(y - centreY, x - centreX) - direction)
      const wrapped = Math.min(difference, Math.PI * 2 - difference)
      if (wrapped < closest) {
        closest = wrapped
        exitAt = at
      }
    }

    const root = Math.min(panel.tailBase * resolution, perimeter / 6)
    const exit = point(exitAt)
    const reach = Math.min(panel.tailReach * resolution, distance - Math.hypot(exit.x - centreX, exit.y - centreY))
    const tipX = centreX + Math.cos(direction) * (Math.hypot(exit.x - centreX, exit.y - centreY) + Math.max(reach, 0))
    const tipY = centreY + Math.sin(direction) * (Math.hypot(exit.x - centreX, exit.y - centreY) + Math.max(reach, 0))

    // Walk the outline from one side of the root all the way round to the other,
    // then out to the tip and back, so the whole thing closes as one boundary.
    const from = exitAt + root
    const span = perimeter - root * 2

    ctx.beginPath()
    const startPoint = point(from)
    ctx.moveTo(startPoint.x, startPoint.y)
    for (let along = step; along < span; along += step) {
      const { x, y } = point(from + along)
      ctx.lineTo(x, y)
    }
    const endPoint = point(from + span)
    ctx.lineTo(endPoint.x, endPoint.y)
    ctx.lineTo(tipX, tipY)
    ctx.closePath()
  }

  /**
   * Prepares the canvas and draws the filled panel, leaving the context placed
   * so callers draw their contents in panel coordinates.
   */
  private beginPanel(content: PresenceBubbleContent, options: PresenceBubblePaintOptions) {
    const width = this.panelWidth(content, options)
    const frame = this.describePanel(width)
    const { resolution } = options

    this.resize(frame.width, frame.height, resolution)

    const ctx = this.context
    ctx.save()
    ctx.translate(surfacePadding * resolution, surfacePadding * resolution)

    this.tracePanel(width, options.tailTarget, resolution)

    // Depth comes from the shadow alone. An outline at this size reads as a hard
    // edge against the character rather than as a raised surface.
    this.withShadow(withAlpha(options.palette.shadow, shadow.alpha), resolution, () => {
      ctx.fillStyle = content.kind === 'unread' ? options.palette.badge : options.palette.panel
      ctx.fill()
    })

    return { frame, width: width * resolution, height: panel.height * resolution }
  }

  private paintThinking(phase: number, animated: boolean, options: PresenceBubblePaintOptions): PresenceBubbleFrame {
    const content: PresenceBubbleContent = { kind: 'thinking', phase, animated }
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
      const lift = animated ? Math.sin(offset * Math.PI * 2) : 0
      // At rest the three read as one mark rather than a paused wave.
      ctx.globalAlpha = animated ? 0.35 + 0.65 * Math.max(0, lift) : 0.8
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
