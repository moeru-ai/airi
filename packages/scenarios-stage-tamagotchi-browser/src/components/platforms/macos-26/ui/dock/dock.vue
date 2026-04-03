<script setup lang="ts">
import { Application, DockDivider, DockRoot } from '../../containers/dock'
import { Refractive } from '../../graphics'
import { Apps, Finder, TrashFull } from '../../icons/applications'
import { Folder } from '../../icons/system'

const props = withDefaults(defineProps<{
  size?: number
}>(), {
  size: 2,
})
</script>

<template>
  <div class="absolute right-2 top-1/2 z-1000 translate-y--1/2">
    <DockRoot :size="props.size">
      <Refractive
        :refraction="{
          radius: 16 * props.size * 0.75,
          blur: 6,
          glassThickness: 70,
          bezelWidth: 8,
          refractiveIndex: 1.5,
          specularOpacity: 0.25,
          specularAngle: Math.PI / 4,
        }"
        :style="{
          background: 'rgb(255 255 255 / 0.12)',
          border: '1px solid rgb(255 255 255 / 0.1)',
        }"
        :class="[
          'p-1.5',
          'flex flex-col  justify-center items-center',
        ]"
      >
        <Application running>
          <Finder />
        </Application>
        <Application>
          <Apps />
        </Application>
        <slot name="dock" />
        <DockDivider />
        <Application :base-size="28">
          <Folder />
        </Application>
        <Application>
          <TrashFull />
        </Application>
      </Refractive>
    </DockRoot>
  </div>
</template>
