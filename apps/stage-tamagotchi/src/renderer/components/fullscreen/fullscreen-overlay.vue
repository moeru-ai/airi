<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { provide, useTemplateRef, watchSyncEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import FullscreenIsland from './fullscreen-island.vue'

import { useFullscreenLayout } from '../../composables/use-fullscreen-layout'
import { useFullscreenStore } from '../../stores/fullscreen'
import { fullscreenPanelKey } from './panel'
import { fullscreenSurfaces } from './surfaces'

// The part of the fullscreen mode that sits over the stage: the island and the surface. Every page that hosts the
// mode shows this one component, so the mode looks and works the same in each of them.
const { t } = useI18n()
const { surface, mounted } = storeToRefs(useFullscreenStore())
const { islandElement, surfaceMargin, surfaceWidth, surfaceDragging, startSurfaceDrag, moveSurfaceDrag, endSurfaceDrag } = useFullscreenLayout()

// The settings layout draws the panel content instead of the settings window frame when it shows here.
provide(fullscreenPanelKey, true)

const island = useTemplateRef<HTMLElement>('island')
watchSyncEffect(() => {
  islandElement.value = island.value ?? undefined
})
</script>

<template>
  <!-- The content keeps its final layout from the bottom left, so a host can show it step by step by clipping it. -->
  <div :class="['absolute bottom-0 left-0 h-screen w-screen']">
    <div ref="island" :class="['pointer-events-auto absolute left-6 top-1/2 -translate-y-1/2']">
      <FullscreenIsland />
    </div>
    <div
      :style="{ width: `${surfaceWidth}px`, top: `${surfaceMargin}px`, right: `${surfaceMargin}px` }"
      :class="['pointer-events-auto absolute bottom-0']"
    >
      <!-- The surface is a sheet that meets the bottom edge of the screen. It keeps a margin at the top and the right. -->
      <div
        :class="[
          'h-full w-full',
          'rounded-t-3xl',
          'bg-$bg-color',
          'overflow-hidden',
        ]"
      >
        <!-- Each surface that showed stays mounted until the mode closes, so switching back finds it as it was. -->
        <div v-for="id in mounted" v-show="id === surface" :key="id" :class="['h-full w-full']">
          <component :is="fullscreenSurfaces[id].panel" />
        </div>
      </div>
      <!-- The handle sits on the left edge of the surface, outside its clipped corners. -->
      <div
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('tamagotchi.stage.fullscreen-surface.resize')"
        :class="[
          'group absolute inset-y-0 -left-3 w-3',
          'flex items-center justify-center',
          'cursor-col-resize touch-none',
        ]"
        @pointerdown="startSurfaceDrag"
        @pointermove="moveSurfaceDrag"
        @pointerup="endSurfaceDrag"
        @pointercancel="endSurfaceDrag"
      >
        <div
          :class="[
            'h-12 w-1 rounded-full',
            'bg-neutral-300 dark:bg-neutral-700',
            'transition-opacity duration-200',
            surfaceDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ]"
        />
      </div>
    </div>
  </div>
</template>
