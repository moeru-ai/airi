import type { PresenceBubbleState } from './content'
import type { PresenceBubbleFrame, PresenceBubblePalette } from './painter'
import type { PresenceBubblePlacementMode } from './placement'

import { resolvePresenceBubbleContent } from './content'
import { PresenceBubbleFollower, smoothTowards } from './follow'
import { PresenceBubblePainter } from './painter'
import { choosePresenceBubbleMode, resolvePresenceBubblePlacement } from './placement'

export interface PresenceBubbleHead {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The renderer-neutral values that advance one presence-bubble frame.
 *
 * @param THead - The renderer's head box, which may carry more than the box,
 * such as the depth VRM projects back to.
 */
export interface PresenceBubbleAdvanceInput<THead extends PresenceBubbleHead = PresenceBubbleHead> {
  state: PresenceBubbleState
  deltaMs: number
  animated: boolean
  resolution: number
  stageWidth: number
  stageHeight: number
  /**
   * Measures the head's box in stage units, or `undefined` while no model is
   * loaded.
   *
   * Called only when there is something to show. Measuring walks every tracked
   * drawable, and the idle stage, which is most frames, should cost one
   * comparison.
   */
  head: () => THead | undefined
  readPalette: () => PresenceBubblePalette
}

/** The canvas frame and its settled top-left position. */
export interface PresenceBubbleAdvanceResult<THead extends PresenceBubbleHead = PresenceBubbleHead> {
  frame: PresenceBubbleFrame
  /** The head box this frame was placed against. */
  head: THead
  x: number
  y: number
  /** The placement chosen from the settled head box. */
  mode: PresenceBubblePlacementMode
  /** `true` when the renderer must upload the painter canvas again. */
  repainted: boolean
}

/**
 * How often the palette is read again, in milliseconds.
 *
 * Watching the dark-mode ref does not work: it and the class that carries the
 * theme are written in the same flush, so a read can land before the class
 * does. The frame loop asks instead, a handful of times a second.
 */
const paletteRefreshMs = 200

/** Space left between the tail's tip and the head, in stage units. */
const headClearance = 4

/**
 * Time the decision takes to follow a change in the head's box, in
 * milliseconds. Long enough to ignore breathing, short enough that a resize
 * moves the bubble while the drag is still happening.
 */
const decisionSettleMs = 180

/**
 * Advances the policy shared by every presence-bubble renderer.
 *
 * This owns the canvas drawing, palette freshness, placement choice, and
 * motion state. Renderers only convert its pixel frame and position.
 */
export class PresenceBubbleAdvancer {
  private readonly painter: PresenceBubblePainter
  private readonly follower = new PresenceBubbleFollower()
  private palette: PresenceBubblePalette | undefined
  private paletteAgeMs = paletteRefreshMs
  private placementMode: ReturnType<typeof choosePresenceBubbleMode> | undefined
  private decisionHead: PresenceBubbleHead | undefined
  private uploadedRevision = -1
  private elapsedMs = 0

  constructor(painter = new PresenceBubblePainter()) {
    this.painter = painter
  }

  /** Advances one frame, or hides the bubble when content or a head is absent. */
  advance<THead extends PresenceBubbleHead>(input: PresenceBubbleAdvanceInput<THead>): PresenceBubbleAdvanceResult<THead> | undefined {
    this.elapsedMs += input.deltaMs

    const content = resolvePresenceBubbleContent(input.state, this.elapsedMs, { animated: input.animated })
    if (!content)
      return this.hide()

    this.paletteAgeMs += input.deltaMs
    if (this.paletteAgeMs >= paletteRefreshMs) {
      this.paletteAgeMs = 0
      this.palette = input.readPalette()
    }

    const head = input.head()
    if (!head)
      return this.hide()

    const palette = this.palette ?? input.readPalette()
    const measured = this.painter.measure(content, { resolution: input.resolution, palette })
    if (!measured)
      return this.hide()

    this.decisionHead = this.decisionHead
      ? {
          x: smoothTowards(this.decisionHead.x, head.x, input.deltaMs, decisionSettleMs),
          y: smoothTowards(this.decisionHead.y, head.y, input.deltaMs, decisionSettleMs),
          width: smoothTowards(this.decisionHead.width, head.width, input.deltaMs, decisionSettleMs),
          height: smoothTowards(this.decisionHead.height, head.height, input.deltaMs, decisionSettleMs),
        }
      : { ...head }

    const stage = {
      stageWidth: input.stageWidth,
      stageHeight: input.stageHeight,
      bubbleWidth: measured.panelWidth,
      bubbleHeight: measured.panelHeight,
      gap: measured.tailReach + headClearance,
    }

    const mode = choosePresenceBubbleMode({
      ...stage,
      headX: this.decisionHead.x,
      headY: this.decisionHead.y,
      headWidth: this.decisionHead.width,
      headHeight: this.decisionHead.height,
    }, this.placementMode)
    this.placementMode = mode

    const placement = resolvePresenceBubblePlacement({
      ...stage,
      headX: head.x,
      headY: head.y,
      headWidth: head.width,
      headHeight: head.height,
    }, mode)
    const settled = this.follower.update(placement.x, placement.y, input.deltaMs)
    const frame = this.painter.paint(content, {
      resolution: input.resolution,
      palette,
      tailTarget: {
        x: head.x + head.width / 2 - settled.x,
        y: head.y + head.height / 2 - settled.y,
      },
    }) ?? measured
    const repainted = frame.revision !== this.uploadedRevision
    this.uploadedRevision = frame.revision

    return { frame, head, x: settled.x, y: settled.y, mode, repainted }
  }

  /** Releases motion after a stage-resolution change. */
  release() {
    this.follower.release()
    this.decisionHead = undefined
  }

  /** Refreshes the palette before the first frame uses the canvas. */
  refreshPalette(readPalette: () => PresenceBubblePalette) {
    this.palette = readPalette()
  }

  /** Returns the canvas that renderers upload to their texture. */
  canvasElement() {
    return this.painter.canvasElement()
  }

  private hide(): undefined {
    this.follower.release()
    this.decisionHead = undefined
    this.placementMode = undefined
    this.paletteAgeMs = paletteRefreshMs
    return undefined
  }
}
