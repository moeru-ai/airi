<script setup lang="ts">
import type { PresenceBubblePalette, PresenceBubblePlacementMode, PresenceBubbleState } from '@proj-airi/stage-shared'
import type { PerspectiveCamera, Vector3 } from 'three'

import {
  choosePresenceBubbleMode,
  PresenceBubbleFollower,
  PresenceBubblePainter,
  resolvePresenceBubbleContent,
  resolvePresenceBubblePlacement,
  smoothTowards,
} from '@proj-airi/stage-shared'
import { useLoop, useTresContext } from '@tresjs/core'
import { usePreferredReducedMotion } from '@vueuse/core'
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 as ThreeVector3 } from 'three'
import { inject, onMounted, onUnmounted, shallowRef } from 'vue'

import { presenceBubblePaletteKey } from './presence-bubble-palette'

const props = withDefaults(defineProps<{
  /** Head position and reach in world space, or `undefined` while no model is loaded. */
  headAnchor: () => { position: Vector3, radius: number } | undefined
  state: PresenceBubbleState
  /** Device pixels per screen unit, so the bubble is painted at display density. */
  resolution?: number
}>(), {
  resolution: 2,
})

const { camera, scene, sizes } = useTresContext()
const activeCamera = camera.activeCamera
const { onBeforeRender } = useLoop()

const sprite = shallowRef<Sprite>()
// The viewer's motion preference is read here, where the browser is, and the
// shared layer is told rather than asking.
const preferredMotion = usePreferredReducedMotion()

const painter = new PresenceBubblePainter()
const follower = new PresenceBubbleFollower()

/**
 * Reads the theme colours, supplied by a parent outside the Tres scene.
 *
 * The colours come from elements carrying the project's own utilities, and those
 * elements cannot live here: this component is mounted by the Tres renderer,
 * which builds Three objects rather than DOM nodes and rejects a plain element.
 */
const readPalette = inject(presenceBubblePaletteKey)

const fallbackPalette: PresenceBubblePalette = {
  panel: '#fafafa',
  shadow: '#171717',
  ink: '#404040',
  badge: '#404040',
  badgeInk: '#fafafa',
}

/** How often the colours are read again, in milliseconds. */
const paletteRefreshMs = 200

/**
 * Space left between the tail's tip and the head, in stage units.
 *
 * The panel stands off by this plus the tail's own reach.
 */
const headClearance = 4

/** Time the decision takes to follow a change in the head's box, in milliseconds. */
const decisionSettleMs = 180

let palette = fallbackPalette
let paletteAgeMs = paletteRefreshMs
let placementMode: PresenceBubblePlacementMode | undefined
let decisionHead: { x: number, y: number, width: number, height: number } | undefined
let uploadedRevision = -1
let elapsedMs = 0

const projected = new ThreeVector3()
const sideways = new ThreeVector3()

function hide(current: Sprite) {
  current.visible = false
  follower.release()
  decisionHead = undefined
  placementMode = undefined
  paletteAgeMs = paletteRefreshMs
}

/**
 * The head's box in screen units.
 *
 * The placement rules are written against a flat stage, so the head is measured
 * where it is drawn rather than where it stands. The reach is measured along the
 * camera's own right axis, which keeps the width honest as the character turns
 * or the camera orbits.
 */
function headBoxOnScreen(active: PerspectiveCamera, width: number, height: number) {
  const anchor = props.headAnchor()
  if (!anchor)
    return undefined

  projected.copy(anchor.position).project(active)
  const centreX = (projected.x + 1) / 2 * width
  const centreY = (1 - projected.y) / 2 * height
  const depth = projected.z

  sideways.setFromMatrixColumn(active.matrixWorld, 0).multiplyScalar(anchor.radius).add(anchor.position).project(active)
  const reach = Math.abs((sideways.x + 1) / 2 * width - centreX)

  return {
    x: centreX - reach,
    y: centreY - reach,
    width: reach * 2,
    height: reach * 2,
    depth,
  }
}

/**
 * Turns a point on screen back into a world position at the head's depth.
 *
 * The bubble is a sprite in the scene, so it has to live somewhere in space. Its
 * size is not attenuated, so only where it lands on screen matters, and the
 * head's depth is the plane that keeps it in front of nothing else.
 */
function screenPointToWorld(active: PerspectiveCamera, x: number, y: number, depth: number, width: number, height: number) {
  return projected.set(x / width * 2 - 1, 1 - y / height * 2, depth).unproject(active)
}

/**
 * Scale that draws a sprite at a given pixel size.
 *
 * A sprite with `sizeAttenuation` off cancels the perspective divide, so its
 * scale is the size it would have one unit from the camera. Dividing by the
 * viewport's own angular height converts a pixel count into that unit.
 */
function scaleForPixels(active: PerspectiveCamera, pixels: number, viewportHeight: number) {
  return pixels / viewportHeight * 2 * Math.tan(active.fov * Math.PI / 360)
}

function drawFrame(deltaMs: number) {
  const current = sprite.value
  const active = activeCamera.value as PerspectiveCamera | undefined
  if (!current || !active)
    return

  elapsedMs += deltaMs

  // Nothing to show is the resting state, so it costs one comparison rather than
  // a projection and a style recalculation whose results would be discarded.
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
    palette = readPalette?.() ?? fallbackPalette
  }

  const viewportWidth = sizes.width.value
  const viewportHeight = sizes.height.value
  const head = headBoxOnScreen(active, viewportWidth, viewportHeight)
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
    : { x: head.x, y: head.y, width: head.width, height: head.height }

  const stage = {
    stageWidth: viewportWidth,
    stageHeight: viewportHeight,
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

  // The tail is aimed from where the panel actually sits, so it keeps pointing
  // at the head while the spring carries it.
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
    // Uploading on every frame would send the same pixels to the GPU at the
    // refresh rate. The painter only redraws when the result would differ.
    const material = current.material as SpriteMaterial
    material.map!.needsUpdate = true
  }

  // Three measures a sprite's centre from its bottom left, and the painter
  // reports its anchor from the top left.
  current.center.set(frame.anchorX / frame.width, 1 - frame.anchorY / frame.height)
  current.scale.set(
    scaleForPixels(active, frame.width, viewportHeight),
    scaleForPixels(active, frame.height, viewportHeight),
    1,
  )

  current.position.copy(screenPointToWorld(active, settled.x, settled.y, head.depth, viewportWidth, viewportHeight))
  current.visible = true
}

onMounted(() => {
  palette = readPalette?.() ?? fallbackPalette

  const texture = new CanvasTexture(painter.canvasElement())
  // The painter draws in the colours the stylesheet gives it, which are sRGB.
  // A texture left unlabelled is read as linear and the theme comes out wrong.
  texture.colorSpace = SRGBColorSpace
  const created = new Sprite(new SpriteMaterial({
    map: texture,
    transparent: true,
    // The bubble is interface, not a lit surface. Tone mapping would pull it
    // toward whatever exposure the scene is graded at.
    toneMapped: false,
    // The bubble belongs in front of the character whatever the pose puts
    // between them, and it writes no depth so nothing sorts against it.
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  }))
  created.renderOrder = Number.MAX_SAFE_INTEGER
  created.visible = false
  sprite.value = created
  scene.value?.add(created)
})

onUnmounted(() => {
  const current = sprite.value
  sprite.value = undefined
  if (!current)
    return

  scene.value?.remove(current)
  const material = current.material as SpriteMaterial
  material.map?.dispose()
  material.dispose()
})

onBeforeRender(({ delta }) => drawFrame(delta * 1000))
</script>

<template>
  <slot />
</template>
