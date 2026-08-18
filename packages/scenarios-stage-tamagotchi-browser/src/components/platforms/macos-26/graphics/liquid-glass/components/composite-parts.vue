<script setup lang="ts">
import { computed } from 'vue'

import { splitImageDataToParts } from '../helpers/split-imagedata-to-parts'

interface CompositePartsProps {
  imageData: ImageData
  cornerWidth: number
  pixelRatio: number
  width: number
  height: number
  result: string
  hideTop?: boolean
  hideBottom?: boolean
  hideLeft?: boolean
  hideRight?: boolean
}

defineOptions({
  name: 'CompositeParts',
})

const props = defineProps<CompositePartsProps>()

const parts = computed(() => splitImageDataToParts({
  imageData: props.imageData,
  cornerWidth: props.cornerWidth,
  pixelRatio: props.pixelRatio,
}))

const widthMinusCorner = computed(() => props.width - props.cornerWidth)
const heightMinusCorner = computed(() => props.height - props.cornerWidth)

const compositePartNames = computed(() =>
  [
    !props.hideTop && 'top',
    !props.hideLeft && 'left',
    !props.hideRight && 'right',
    !props.hideBottom && 'bottom',
    !props.hideTop && !props.hideLeft && 'topLeft',
    !props.hideTop && !props.hideRight && 'topRight',
    !props.hideBottom && !props.hideLeft && 'bottomLeft',
    !props.hideBottom && !props.hideRight && 'bottomRight',
  ].filter((partName): partName is string => typeof partName === 'string'),
)
</script>

<template>
  <feImage
    :href="parts.topLeft"
    :x="0"
    :y="0"
    :width="cornerWidth"
    :height="cornerWidth"
    :result="`${result}_topLeft`"
    preserveAspectRatio="none"
  />
  <feImage
    :href="parts.top"
    :x="0"
    :y="0"
    :width="width"
    :height="cornerWidth"
    :result="`${result}_top`"
    preserveAspectRatio="none"
  />
  <feImage
    :href="parts.topRight"
    :x="widthMinusCorner"
    :y="0"
    :width="cornerWidth"
    :height="cornerWidth"
    :result="`${result}_topRight`"
    preserveAspectRatio="none"
  />
  <feImage
    :href="parts.left"
    :x="0"
    :y="0"
    :width="cornerWidth"
    :height="height"
    :result="`${result}_left`"
    preserveAspectRatio="none"
  />
  <feImage
    :href="parts.right"
    :x="widthMinusCorner"
    :y="0"
    :width="cornerWidth"
    :height="height"
    :result="`${result}_right`"
    preserveAspectRatio="none"
  />
  <feImage
    :href="parts.bottomLeft"
    :x="0"
    :y="heightMinusCorner"
    :width="cornerWidth"
    :height="cornerWidth"
    :result="`${result}_bottomLeft`"
    preserveAspectRatio="none"
  />
  <feImage
    :href="parts.bottom"
    :x="0"
    :y="heightMinusCorner"
    :width="width"
    :height="cornerWidth"
    :result="`${result}_bottom`"
    preserveAspectRatio="none"
  />
  <feImage
    :href="parts.bottomRight"
    :x="widthMinusCorner"
    :y="heightMinusCorner"
    :width="cornerWidth"
    :height="cornerWidth"
    :result="`${result}_bottomRight`"
    preserveAspectRatio="none"
  />

  <feImage
    :href="parts.center"
    :x="0"
    :y="0"
    :width="width"
    :height="height"
    :result="`${result}_base`"
    preserveAspectRatio="none"
  />

  <feComposite
    v-for="(partName, index) in compositePartNames"
    :key="partName"
    operator="over"
    :in="`${result}_${partName}`"
    :in2="index === 0 ? `${result}_base` : `${result}_composite_${index}`"
    :result="index === compositePartNames.length - 1 ? result : `${result}_composite_${index}`"
  />
</template>
