<script setup lang="ts">
// NOTICE:
// This file ports the `beam` variant of boring-avatars, because no maintained Vue package exists.
// Upstream ships React components only, and its hosted API needs a paid subscription.
// Source: boring-avatars 2.0.4 `dist/index.js`. Copyright (c) 2021 boringdesigners, MIT License:
// https://github.com/boringdesigners/boring-avatars/blob/master/LICENSE
// The hash and the shape math are identical to upstream, so one seed draws the same shapes in both.
// The colors differ from upstream: they follow the theme hue, as `palette` describes.
// The upstream corner mask is omitted. The parent `Avatar` clips the corners, and inline SVG clips to its viewBox.
// Remove this port when a maintained Vue or framework-free build of boring-avatars exists.

import { computed } from 'vue'

interface BeamAvatarProps {
  /** Stable identity that selects the shapes and colors, for example a user ID. */
  seed: string
}

const props = defineProps<BeamAvatarProps>()

/**
 * Five colors around the theme hue, from 60 degrees below it to 60 degrees above it.
 *
 * Each app writes the theme hue to `--chromatic-hue` on the root element, and the dynamic hue mode animates it.
 * CSS resolves the colors, so the avatar follows a hue change without a re-render.
 * The fallback `220.44` is `DEFAULT_THEME_COLORS_HUE` in `@proj-airi/stage-ui`, for pages that do not set the variable.
 *
 * Upstream picks a black or white face from the wrapper's hex color. Here each color has a fixed OKLCH lightness,
 * so `face` is fixed per color. The lightness values keep the face at a contrast of 3.6:1 or more at every hue.
 */
const palette = [
  { offset: -60, lightness: 0.85, face: '#000000' },
  { offset: -30, lightness: 0.72, face: '#000000' },
  { offset: 0, lightness: 0.58, face: '#FFFFFF' },
  { offset: 30, lightness: 0.78, face: '#000000' },
  { offset: 60, lightness: 0.6, face: '#FFFFFF' },
].map(({ offset, lightness, face }) => ({
  color: `oklch(${lightness} 0.12 calc(var(--chromatic-hue, 220.44) + ${offset}))`,
  face,
}))

/** Side of the square viewBox that the upstream shape math uses. */
const size = 36

function hashCode(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}

function getDigit(value: number, position: number) {
  return Math.floor((value / 10 ** position) % 10)
}

function getBoolean(value: number, position: number) {
  return !(getDigit(value, position) % 2)
}

/** Returns `value % range`, negated when the digit at `index` is even. */
function getUnit(value: number, range: number, index?: number) {
  const unit = value % range
  return index && getDigit(value, index) % 2 === 0 ? -unit : unit
}

function getColor(value: number) {
  return palette[value % palette.length]!
}

const beam = computed(() => {
  const hash = hashCode(props.seed)
  const wrapper = getColor(hash)

  // Small offsets are pushed out by `size / 9`, so the wrapper shape never sits centered.
  const rawTranslateX = getUnit(hash, 10, 1)
  const wrapperTranslateX = rawTranslateX < 5 ? rawTranslateX + size / 9 : rawTranslateX
  const rawTranslateY = getUnit(hash, 10, 2)
  const wrapperTranslateY = rawTranslateY < 5 ? rawTranslateY + size / 9 : rawTranslateY

  return {
    wrapperColor: wrapper.color,
    faceColor: wrapper.face,
    backgroundColor: getColor(hash + 13).color,
    wrapperTranslateX,
    wrapperTranslateY,
    wrapperRotate: getUnit(hash, 360),
    wrapperScale: 1 + getUnit(hash, size / 12) / 10,
    isMouthOpen: getBoolean(hash, 2),
    isCircle: getBoolean(hash, 1),
    eyeSpread: getUnit(hash, 5),
    mouthSpread: getUnit(hash, 3),
    faceRotate: getUnit(hash, 10, 3),
    faceTranslateX: wrapperTranslateX > size / 6 ? wrapperTranslateX / 2 : getUnit(hash, 8, 1),
    faceTranslateY: wrapperTranslateY > size / 6 ? wrapperTranslateY / 2 : getUnit(hash, 7, 2),
  }
})
</script>

<template>
  <svg
    data-beam-avatar
    :viewBox="`0 0 ${size} ${size}`"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    :class="['size-full']"
  >
    <rect :width="size" :height="size" :style="{ fill: beam.backgroundColor }" />
    <rect
      x="0"
      y="0"
      :width="size"
      :height="size"
      :transform="`translate(${beam.wrapperTranslateX} ${beam.wrapperTranslateY}) rotate(${beam.wrapperRotate} ${size / 2} ${size / 2}) scale(${beam.wrapperScale})`"
      :style="{ fill: beam.wrapperColor }"
      :rx="beam.isCircle ? size : size / 6"
    />
    <g :transform="`translate(${beam.faceTranslateX} ${beam.faceTranslateY}) rotate(${beam.faceRotate} ${size / 2} ${size / 2})`">
      <path
        v-if="beam.isMouthOpen"
        :d="`M15 ${19 + beam.mouthSpread}c2 1 4 1 6 0`"
        :stroke="beam.faceColor"
        fill="none"
        stroke-linecap="round"
      />
      <path
        v-else
        :d="`M13,${19 + beam.mouthSpread} a1,0.75 0 0,0 10,0`"
        :fill="beam.faceColor"
      />
      <rect :x="14 - beam.eyeSpread" y="14" width="1.5" height="2" rx="1" stroke="none" :fill="beam.faceColor" />
      <rect :x="20 + beam.eyeSpread" y="14" width="1.5" height="2" rx="1" stroke="none" :fill="beam.faceColor" />
    </g>
  </svg>
</template>
