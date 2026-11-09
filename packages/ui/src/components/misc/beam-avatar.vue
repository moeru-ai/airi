<script setup lang="ts">
// NOTICE:
// This file ports the `beam` variant of boring-avatars, because no maintained Vue package exists.
// Upstream ships React components only, and its hosted API needs a paid subscription.
// Source: boring-avatars 2.0.4 `dist/index.js`. Copyright (c) 2021 boringdesigners, MIT License:
// https://github.com/boringdesigners/boring-avatars/blob/master/LICENSE
// The hash and the shape math are identical to upstream, so one seed draws the same face in both.
// The upstream corner mask is omitted. The parent `Avatar` clips the corners, and inline SVG clips to its viewBox.
// Remove this port when a maintained Vue or framework-free build of boring-avatars exists.

import { computed } from 'vue'

interface BeamAvatarProps {
  /** Stable identity that selects the shapes and colors, for example a user ID. */
  seed: string
}

const props = defineProps<BeamAvatarProps>()

/** The upstream default palette. The face colors need concrete hex values to compute contrast. */
const colors = ['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']

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
  return colors[value % colors.length]!
}

/** Returns black or white, whichever reads better on the given `#rrggbb` color (YIQ brightness). */
function getContrast(hex: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000000' : '#FFFFFF'
}

const beam = computed(() => {
  const hash = hashCode(props.seed)
  const wrapperColor = getColor(hash)

  // Small offsets are pushed out by `size / 9`, so the wrapper shape never sits centered.
  const rawTranslateX = getUnit(hash, 10, 1)
  const wrapperTranslateX = rawTranslateX < 5 ? rawTranslateX + size / 9 : rawTranslateX
  const rawTranslateY = getUnit(hash, 10, 2)
  const wrapperTranslateY = rawTranslateY < 5 ? rawTranslateY + size / 9 : rawTranslateY

  return {
    wrapperColor,
    faceColor: getContrast(wrapperColor),
    backgroundColor: getColor(hash + 13),
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
    <rect :width="size" :height="size" :fill="beam.backgroundColor" />
    <rect
      x="0"
      y="0"
      :width="size"
      :height="size"
      :transform="`translate(${beam.wrapperTranslateX} ${beam.wrapperTranslateY}) rotate(${beam.wrapperRotate} ${size / 2} ${size / 2}) scale(${beam.wrapperScale})`"
      :fill="beam.wrapperColor"
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
