<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Sprite as PixiSprite } from '@pixi/sprite'
import type { PresenceBubblePalette, PresenceBubbleState } from '@proj-airi/stage-shared'

import type { Live2DModelCanvasRect } from '../../../composables/live2d'

import { Texture } from '@pixi/core'
import { Sprite } from '@pixi/sprite'
import { UPDATE_PRIORITY } from '@pixi/ticker'
import {
  createPresenceFrameClock,
  PresenceBubbleAdvancer,
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

const advancer = new PresenceBubbleAdvancer()

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
 * Hands out the time since the last drawing, wherever it came from.
 *
 * The ticker and a resize both draw, and each measuring its own interval counts
 * the stretch between them twice.
 */
const frameClock = createPresenceFrameClock(() => performance.now())

function drawFrame() {
  const deltaMs = frameClock.since()
  const current = sprite.value
  if (!current)
    return

  const head = props.headAnchor()
  const advanced = advancer.advance({
    state: props.state,
    deltaMs,
    animated: preferredMotion.value !== 'reduce',
    resolution: props.resolution,
    stageWidth: props.app.screen.width / props.resolution,
    stageHeight: props.app.screen.height / props.resolution,
    head,
    readPalette,
  })
  if (!advanced) {
    current.visible = false
    return
  }

  if (advanced.repainted) {
    // The painter resizes its canvas between the bubble and the badge, and the
    // resource reads the new size back off the canvas element.
    current.texture.baseTexture.resource.update()
  }

  current.anchor.set(advanced.frame.anchorX / advanced.frame.width, advanced.frame.anchorY / advanced.frame.height)
  current.width = advanced.frame.width
  current.height = advanced.frame.height
  current.position.set(advanced.x, advanced.y)
  current.visible = true
}

onMounted(() => {
  advancer.refreshPalette(readPalette)

  const created = new Sprite(Texture.from(advancer.canvasElement()))
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
  advancer.release()
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
