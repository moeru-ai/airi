<script setup lang="ts">
import type { Component, StyleValue } from 'vue'

import type { SurfaceFnDef } from '../helpers/surface-equations'

import { computed, onBeforeUnmount, onMounted, shallowRef, useAttrs, useId } from 'vue'

import Filter from '../components/filter.vue'

import { convex } from '../helpers/surface-equations'

interface RefractionOptions {
  radius: number
  blur?: number
  glassThickness?: number
  bezelWidth?: number
  refractiveIndex?: number
  specularOpacity?: number
  specularAngle?: number
  bezelHeightFn?: SurfaceFnDef
}

interface RefractiveProps {
  as?: string | Component
  refraction: RefractionOptions
}

defineOptions({
  name: 'Refractive',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<RefractiveProps>(), {
  as: 'div',
})

defineSlots<{
  default?: () => unknown
}>()

const attrs = useAttrs()
const filterId = useId()
const elementRef = shallowRef<HTMLElement | null>(null)
const width = shallowRef(0)
const height = shallowRef(0)
let resizeObserver: ResizeObserver | null = null

const forwardedAttrs = computed(() => {
  const { style: _style, ...rest } = attrs
  return rest
})

const mergedStyle = computed<StyleValue>(() => [
  attrs.style as StyleValue,
  {
    backdropFilter: `url(#${filterId})`,
    borderRadius: `${props.refraction.radius}px`,
  },
])

const resolvedRefraction = computed(() => ({
  blur: props.refraction.blur ?? 0,
  glassThickness: props.refraction.glassThickness ?? 70,
  bezelWidth: props.refraction.bezelWidth ?? 0,
  refractiveIndex: props.refraction.refractiveIndex ?? 1.5,
  specularOpacity: props.refraction.specularOpacity ?? 0,
  specularAngle: props.refraction.specularAngle ?? 0,
  bezelHeightFn: props.refraction.bezelHeightFn ?? convex,
}))

function updateSize(entry: ResizeObserverEntry) {
  const borderBox = Array.isArray(entry.borderBoxSize)
    ? entry.borderBoxSize[0]
    : entry.borderBoxSize

  if (borderBox) {
    width.value = borderBox.inlineSize
    height.value = borderBox.blockSize
    return
  }

  width.value = entry.contentRect.width
  height.value = entry.contentRect.height
}

onMounted(() => {
  if (!elementRef.value) {
    return
  }

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      updateSize(entry)
    }
  })

  resizeObserver.observe(elementRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <Filter
    :id="filterId"
    :scale-ratio="1"
    :pixel-ratio="6"
    :width="width"
    :height="height"
    :radius="refraction.radius"
    :blur="resolvedRefraction.blur"
    :glass-thickness="resolvedRefraction.glassThickness"
    :bezel-width="resolvedRefraction.bezelWidth"
    :refractive-index="resolvedRefraction.refractiveIndex"
    :specular-opacity="resolvedRefraction.specularOpacity"
    :specular-angle="resolvedRefraction.specularAngle"
    :bezel-height-fn="resolvedRefraction.bezelHeightFn"
  />

  <component
    :is="as"
    ref="elementRef"
    v-bind="forwardedAttrs"
    :style="mergedStyle"
  >
    <slot />
  </component>
</template>
