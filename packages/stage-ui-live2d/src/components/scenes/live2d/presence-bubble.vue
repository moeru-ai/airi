<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Sprite as PixiSprite } from '@pixi/sprite'
import type { PresenceBubblePalette, PresenceBubblePlacementMode, PresenceBubbleState } from '@proj-airi/stage-shared'

import type { Live2DModelCanvasRect } from '../../../composables/live2d'

import { Texture } from '@pixi/core'
import { Sprite } from '@pixi/sprite'
import { UPDATE_PRIORITY } from '@pixi/ticker'
import {
  choosePresenceBubbleMode,
  createPresenceFrameClock,
  PresenceBubbleFollower,
  PresenceBubblePainter,
  resolvePresenceBubbleContent,
  resolvePresenceBubblePlacement,
  smoothTowards,
} from '@proj-airi/stage-shared'
import { usePreferredReducedMotion } from '@vueuse/core'
import { formatHex } from 'culori'
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  app: Application
  /**
   * The head's box in the space the stage draws in, or `undefined` while no
   * model is loaded.
   */
  headAnchor: () => Live2DModelCanvasRect | undefined
  state: PresenceBubbleState
  /** Stage size in stage units, watched so a resize places the bubble again. */
  width: number
  height: number
  /** Device pixels per stage unit, so the bubble is painted at display density. */
  resolution?: number
}>(), {
  resolution: 2,
})

const sprite = shallowRef<PixiSprite>()
// The viewer's motion preference is read here, where the browser is, and the
// shared layer is told rather than asking.
const preferredMotion = usePreferredReducedMotion()

const painter = new PresenceBubblePainter()
const follower = new PresenceBubbleFollower()

// Canvas drawing takes colour values, so the theme is read off elements carrying
// the project's own utilities rather than restated as literals here. This is the
// same route the Live2D drop shadow takes to reach its filter.
const panelProbe = useTemplateRef<HTMLDivElement>('panelProbe')
const shadowProbe = useTemplateRef<HTMLDivElement>('shadowProbe')
const inkProbe = useTemplateRef<HTMLDivElement>('inkProbe')
const badgeProbe = useTemplateRef<HTMLDivElement>('badgeProbe')
const badgeInkProbe = useTemplateRef<HTMLDivElement>('badgeInkProbe')

const fallbackPalette: PresenceBubblePalette = {
  panel: '#fafafa',
  shadow: '#171717',
  ink: '#404040',
  badge: '#404040',
  badgeInk: '#fafafa',
}

function readProbe(element: HTMLDivElement | null, fallback: string) {
  if (!element)
    return fallback

  return formatHex(getComputedStyle(element).backgroundColor) ?? fallback
}

function readPalette(): PresenceBubblePalette {
  return {
    panel: readProbe(panelProbe.value, fallbackPalette.panel),
    shadow: readProbe(shadowProbe.value, fallbackPalette.shadow),
    ink: readProbe(inkProbe.value, fallbackPalette.ink),
    badge: readProbe(badgeProbe.value, fallbackPalette.badge),
    badgeInk: readProbe(badgeInkProbe.value, fallbackPalette.badgeInk),
  }
}

/**
 * How often the probes are read again, in milliseconds.
 *
 * Colour lives in the stylesheet, so a theme or hue change alters what the
 * probes report without anything here being notified. Watching the dark-mode
 * ref does not work: it and the class that carries the theme are written by
 * watchers of the same flush, so a read can land before the class does. The
 * frame loop asks instead, which is how the model's drop shadow tracks the same
 * palette, and this interval keeps that to a handful of reads a second.
 */
const paletteRefreshMs = 200

let palette = fallbackPalette
let paletteAgeMs = paletteRefreshMs

/**
 * Hands out the time since the last drawing, wherever it came from.
 *
 * The ticker and a resize both draw, and each measuring its own interval counts
 * the stretch between them twice.
 */
const frameClock = createPresenceFrameClock(() => performance.now())

// Kept between frames so the bubble holds a position while it still fits.
let placementMode: PresenceBubblePlacementMode | undefined

/**
 * Space left between the tail's tip and the head, in stage units.
 *
 * The panel stands off by this plus the tail's own reach, so the tail spans
 * the distance instead of being drawn into the character.
 */
const headClearance = 4

/**
 * Time the decision takes to follow a change in the head's box, in milliseconds.
 *
 * Long enough to ignore breathing, short enough that a resize moves the bubble
 * while the drag is still happening.
 */
const decisionSettleMs = 180

// The bubble follows the head as measured, and decides where to sit from a
// settled copy. Deciding on the raw box would reconsider the position on every
// breath; following the settled one would make the bubble lag the head.
let decisionHead: Live2DModelCanvasRect | undefined
let uploadedRevision = -1
let elapsedMs = 0

/**
 * Takes the bubble off the stage and drops everything it was carrying.
 *
 * A hidden bubble keeps no seat, because the model can be replaced or moved
 * while it is away and reappearing from the old coordinates would send it across
 * the stage. The palette is marked stale for the same reason: the theme can
 * change while nothing is drawn.
 */
function hide(sprite: PixiSprite) {
  sprite.visible = false
  follower.release()
  decisionHead = undefined
  placementMode = undefined
  paletteAgeMs = paletteRefreshMs
}

function drawFrame() {
  const deltaMs = frameClock.since()
  const current = sprite.value
  if (!current)
    return

  elapsedMs += deltaMs

  // Nothing to show is the resting state, so it costs one comparison. Measuring
  // the head walks every tracked drawable's vertices and reading the palette
  // forces a style recalculation, and neither result would be used.
  const content = resolvePresenceBubbleContent(props.state, elapsedMs, {
    animated: preferredMotion.value !== 'reduce',
  })
  if (!content) {
    hide(current)
    return
  }

  paletteAgeMs += deltaMs
  if (paletteAgeMs >= paletteRefreshMs) {
    paletteAgeMs = 0
    palette = readPalette()
  }

  const head = props.headAnchor()
  if (!head) {
    hide(current)
    return
  }

  // Measuring first gives the size the placement needs. The drawing happens once,
  // below, so the panel and its tail always come from the same numbers.
  const measured = painter.measure(content, { resolution: props.resolution, palette })
  if (!measured) {
    hide(current)
    return
  }

  decisionHead = decisionHead
    ? {
        x: smoothTowards(decisionHead.x, head.x, deltaMs, decisionSettleMs),
        y: smoothTowards(decisionHead.y, head.y, deltaMs, decisionSettleMs),
        width: smoothTowards(decisionHead.width, head.width, deltaMs, decisionSettleMs),
        height: smoothTowards(decisionHead.height, head.height, deltaMs, decisionSettleMs),
      }
    : { ...head }

  const stage = {
    stageWidth: props.app.screen.width / props.resolution,
    stageHeight: props.app.screen.height / props.resolution,
    bubbleWidth: measured.panelWidth,
    bubbleHeight: measured.panelHeight,
    // The tail spans this, so the panel stands off by it and the tip lands on
    // the head rather than inside it.
    gap: measured.tailReach + headClearance,
  }

  // The settled box decides which position to take, and the measured box says
  // where that position is.
  placementMode = choosePresenceBubbleMode({
    ...stage,
    headX: decisionHead.x,
    headY: decisionHead.y,
    headWidth: decisionHead.width,
    headHeight: decisionHead.height,
  }, placementMode)

  const placement = resolvePresenceBubblePlacement({
    ...stage,
    headX: head.x,
    headY: head.y,
    headWidth: head.width,
    headHeight: head.height,
  }, placementMode)

  const settled = follower.update(placement.x, placement.y, deltaMs)

  // The tail is aimed from where the panel actually sits, which the spring is
  // still carrying toward its target, so it keeps pointing at the head while it
  // travels.
  const frame = painter.paint(content, {
    resolution: props.resolution,
    palette,
    tailTarget: {
      x: head.x + head.width / 2 - settled.x,
      y: head.y + head.height / 2 - settled.y,
    },
  }) ?? measured

  if (frame.revision !== uploadedRevision) {
    uploadedRevision = frame.revision
    // The painter resizes its canvas between the bubble and the badge, and the
    // resource reads the new size back off the canvas element.
    current.texture.baseTexture.resource.update()
  }

  current.anchor.set(frame.anchorX / frame.width, frame.anchorY / frame.height)
  current.width = frame.width
  current.height = frame.height
  current.position.set(settled.x, settled.y)
  current.visible = true
}

onMounted(() => {
  palette = readPalette()

  const created = new Sprite(Texture.from(painter.canvasElement()))
  created.visible = false
  sprite.value = created
  props.app.stage.addChild(created)

  // Runs ahead of the stage render so the position written here is the one the
  // frame draws. The pose it reads is the previous frame's, because the Live2D
  // model updates its drawables during render; the follower's lag is larger than
  // that by design.
  props.app.ticker.add(drawFrame, undefined, UPDATE_PRIORITY.HIGH)
})

onUnmounted(() => {
  props.app.ticker.remove(drawFrame)

  const current = sprite.value
  sprite.value = undefined
  if (!current)
    return

  props.app.stage.removeChild(current)
  current.destroy({ texture: true, baseTexture: true })
})

// The canvas draws a frame during a resize, so the bubble is drawn again at
// once rather than on the next tick. The spring is advanced, not released:
// releasing it would snap the bubble to the head for the whole drag, which is
// when its weight shows most.
watch([() => props.width, () => props.height], drawFrame, { flush: 'post' })

// Render scale does change what a stage unit means, so a position carried across
// it describes a stage that no longer exists.
watch(() => props.resolution, () => {
  follower.release()
  decisionHead = undefined
})
</script>

<template>
  <div hidden>
    <div ref="panelProbe" :class="['bg-neutral-50 dark:bg-neutral-800']" />
    <div ref="shadowProbe" :class="['bg-neutral-900 dark:bg-neutral-950']" />
    <div ref="inkProbe" :class="['bg-neutral-700 dark:bg-neutral-200']" />
    <div ref="badgeProbe" :class="['bg-primary-500 dark:bg-primary-400']" />
    <div ref="badgeInkProbe" :class="['bg-neutral-50 dark:bg-neutral-900']" />
  </div>
  <slot />
</template>
