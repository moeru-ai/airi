<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useRouter } from 'vue-router'

const router = useRouter()
const settings = useSettings()
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Settings</span>
      </div>
      <div text-3xl font-semibold>
        Themes
      </div>
    </h1>
  </div>
  <Collapsable mt-4 w-full :default="true">
    <template #trigger="slotProps">
      <button
        bg="zinc-100 dark:zinc-800"
        hover="bg-zinc-200 dark:bg-zinc-700"
        transition="all ease-in-out duration-250"
        w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
        class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex="~ row 1" items-center gap-1.5>
          <div
            i-solar:pallete-2-bold-duotone class="provider-icon size-6"
            transition="filter duration-250 ease-in-out"
          />
          <div>
            Colors
          </div>
        </div>
        <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
          <div i-solar:alt-arrow-down-bold-duotone />
        </div>
      </button>
    </template>
    <div p-4>
      <div class="flex items-center gap-8">
        <div class="flex items-center gap-1 text-sm font-medium">
          Primary color
        </div>

        <input v-model="settings.themeColorsHue" type="range" min="0" max="360" step="1" class="theme-hue-slider">
      </div>
      <div mt-4 h-10 w-full flex overflow-hidden rounded-lg>
        <div bg="primary-50" class="primary-color-bar">
          50
        </div>
        <div bg="primary-100" class="primary-color-bar">
          100
        </div>
        <div bg="primary-200" class="primary-color-bar">
          200
        </div>
        <div bg="primary-300" class="primary-color-bar">
          300
        </div>
        <div bg="primary-400" class="primary-color-bar">
          400
        </div>
        <div bg="primary-500" class="primary-color-bar">
          500
        </div>
        <div bg="primary-600" class="primary-color-bar">
          600
        </div>
        <div bg="primary-700" class="primary-color-bar">
          700
        </div>
        <div bg="primary-800" class="primary-color-bar" text-white>
          800
        </div>
        <div bg="primary-900" class="primary-color-bar" text-white>
          900
        </div>
        <div bg="primary-950" class="primary-color-bar" text-white>
          950
        </div>
        <div bg="primary-960" class="primary-color-bar" text-white>
          960
        </div>
        <div bg="primary-970" class="primary-color-bar" text-white>
          970
        </div>
        <div bg="primary-980" class="primary-color-bar" text-white>
          980
        </div>
        <div bg="primary-990" class="primary-color-bar" text-white>
          990
        </div>
      </div>
    </div>
  </Collapsable>
  <div fixed bottom-0 right-0 z--1 text="neutral-100/80 dark:neutral-500/20">
    <div text="40" i-lucide:paintbrush translate-x-10 translate-y-10 />
  </div>
</template>

<style>
.primary-color-bar {
  @apply w-full h-full flex-1 flex items-center justify-center;
}

.theme-hue-slider {
  @apply flex-1 w-32 h-2 rounded-full appearance-none;
  background: linear-gradient(
    to right,
    oklch(85% 0.2 0),
    oklch(85% 0.2 60),
    oklch(85% 0.2 120),
    oklch(85% 0.2 180),
    oklch(85% 0.2 240),
    oklch(85% 0.2 300),
    oklch(85% 0.2 360)
  );
}
</style>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
