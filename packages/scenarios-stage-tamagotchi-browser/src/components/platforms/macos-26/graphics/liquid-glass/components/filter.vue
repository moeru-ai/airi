<script setup lang="ts">
import { computed } from 'vue'

import CompositeParts from './composite-parts.vue'

import {
  calculateDisplacementMap,
  calculateDisplacementMapRadius,
} from '../maps/displacement-map'
import { calculateSpecularImage } from '../maps/specular'

interface FilterProps {
  id: string
  scaleRatio: number
  blur: number
  width: number
  height: number
  radius: number
  glassThickness: number
  bezelWidth: number
  refractiveIndex: number
  specularOpacity: number
  specularAngle: number
  bezelHeightFn: (x: number) => number
  pixelRatio: number
  hideTop?: boolean
  hideBottom?: boolean
  hideLeft?: boolean
  hideRight?: boolean
}

defineOptions({
  name: 'LiquidGlassFilter',
})

const props = defineProps<FilterProps>()

const cornerWidth = computed(() => Math.max(props.radius, props.bezelWidth))
const imageSide = computed(() => cornerWidth.value * 2 + 1)

const displacementRadiusMap = computed(() => calculateDisplacementMapRadius(
  props.glassThickness,
  props.bezelWidth,
  props.bezelHeightFn,
  props.refractiveIndex,
))

const maximumDisplacement = computed(() =>
  Math.max(...displacementRadiusMap.value.map(Math.abs)),
)

const displacementMap = computed(() => calculateDisplacementMap({
  width: imageSide.value,
  height: imageSide.value,
  radius: props.radius,
  bezelWidth: props.bezelWidth,
  precomputedDisplacementMap: displacementRadiusMap.value,
  maximumDisplacement: maximumDisplacement.value,
  pixelRatio: props.pixelRatio,
}))

const specularMap = computed(() => calculateSpecularImage({
  width: imageSide.value,
  height: imageSide.value,
  radius: props.radius,
  specularAngle: props.specularAngle,
  pixelRatio: props.pixelRatio,
}))

const scale = computed(() => maximumDisplacement.value * props.scaleRatio)
</script>

<template>
  <svg color-interpolation-filters="sRGB" :style="{ display: 'none' }">
    <defs>
      <filter :id="id">
        <feGaussianBlur
          in="SourceGraphic"
          :stdDeviation="blur"
          result="blurred_source"
        />

        <CompositeParts
          :image-data="displacementMap"
          :width="width"
          :height="height"
          :corner-width="cornerWidth"
          :pixel-ratio="pixelRatio"
          result="displacement_map"
          :hide-top="hideTop"
          :hide-bottom="hideBottom"
          :hide-left="hideLeft"
          :hide-right="hideRight"
        />

        <CompositeParts
          :image-data="specularMap"
          :width="width"
          :height="height"
          :corner-width="cornerWidth"
          :pixel-ratio="pixelRatio"
          result="specular_map"
          :hide-top="hideTop"
          :hide-bottom="hideBottom"
          :hide-left="hideLeft"
          :hide-right="hideRight"
        />

        <feDisplacementMap
          in="blurred_source"
          in2="displacement_map"
          :scale="scale"
          xChannelSelector="R"
          yChannelSelector="G"
          result="displaced_source"
        />

        <feColorMatrix
          in="specular_map"
          type="luminanceToAlpha"
          result="specular_alpha"
        />

        <feComponentTransfer in="specular_alpha" result="specular_with_opacity">
          <feFuncA type="linear" :slope="specularOpacity" />
        </feComponentTransfer>

        <feFlood flood-color="white" result="white_layer" />

        <feComposite
          in="white_layer"
          in2="specular_with_opacity"
          operator="in"
          result="masked_specular"
        />

        <feComposite
          in="masked_specular"
          in2="displaced_source"
          operator="over"
        />
      </filter>
    </defs>
  </svg>
</template>
