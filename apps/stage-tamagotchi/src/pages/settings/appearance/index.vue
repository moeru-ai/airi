<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useDark } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CheckBar from '../../../components/Settings/CheckBar.vue'
import ColorPalette from '../../../components/Settings/ColorPalette.vue'
import COLOR_PRESETS from './color-presets.json'

const settings = useSettings()
const dark = useDark()
const { t } = useI18n()

const usePageSpecificTransitionsSettingChanged = ref(false)

// avoid showing the animation component when the page specific transitions are enabled
watch(() => [settings.usePageSpecificTransitions, settings.disableTransitions], () => {
  usePageSpecificTransitionsSettingChanged.value = true
})
</script>

<template>
  <Section
    v-motion
    :title="t('settings.sections.section.general.title')"
    icon="i-solar:filters-bold-duotone"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (1 * 10)"
    :delay="1 * 50"
    transition="all ease-in-out duration-250"
  >
    <!-- Theme Setting -->
    <CheckBar
      v-model="dark"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (2 * 10)"
      :delay="2 * 50"
      icon-on="i-solar:moon-stars-bold-duotone"
      icon-off="i-solar:sun-fog-bold-duotone"
      text="settings.theme"
      transition="all ease-in-out duration-250"
    />
    <!-- Language Setting -->
    <div
      v-motion
      class="w-full flex items-center justify-between rounded-lg px-4 py-3 text-sm outline-none transition-all duration-250 ease-in-out"
      bg="neutral-50 dark:neutral-800"
      hover="bg-neutral-200 dark:bg-neutral-700"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (3 * 10)"
      :delay="3 * 50"
      transition="all ease-in-out duration-250"
    >
      {{ $t('settings.language.title') }}
      <select
        v-model="settings.language"
        transition="all ease-in-out duration-250"
        cursor-pointer bg-transparent text-right outline-none
      >
        <option value="en-US">
          {{ $t('settings.language.english') }}
        </option>
        <option value="zh-CN">
          {{ $t('settings.language.chinese') }}
        </option>
      </select>
    </div>
  </Section>

  <Section
    v-motion
    :title="t('settings.pages.themes.sections.section.custom-color.title')"
    icon="i-solar:pallete-2-bold-duotone"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (4 * 10)"
    :delay="4 * 50"
    transition="all ease-in-out duration-250"
  >
    <div
      v-motion flex items-center
      justify-between
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (5 * 10)"
      :delay="5 * 50"
      transition="all ease-in-out duration-250"
    >
      <span text-lg font-semibold>{{ $t('settings.pages.themes.sections.section.custom-color.fields.field.primary-color.label') }}</span>
      <label relative flex cursor-pointer items-center gap-2>
        <input
          v-model="settings.themeColorsHueDynamic"
          type="checkbox"
          class="peer sr-only"
        >
        <div
          class="peer-checked:bg-primary-500 h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white dark:bg-neutral-600 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"
        />
        {{ $t('settings.pages.themes.sections.section.custom-color.fields.field.primary-color.rgb-on.title') }}
      </label>
    </div>
    <input
      v-model="settings.themeColorsHue"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (6 * 10)"
      :delay="6 * 50"
      transition="all ease-in-out duration-250"
      type="range" min="0" max="360" step="0.01" class="theme-hue-slider"
      :disabled="settings.themeColorsHueDynamic"
      :class="settings.themeColorsHueDynamic ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer'"
    >
    <div
      v-motion
      class="color-bar"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (7 * 10)"
      :delay="7 * 50"
      transition="all ease-in-out duration-250"
    >
      <span bg-primary-50>50</span>
      <span bg-primary-100>100</span>
      <span bg-primary-200>200</span>
      <span bg-primary-300>300</span>
      <span bg-primary-400>400</span>
      <span bg-primary-500>500</span>
      <div
        v-motion
        text-white
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (8 * 10)"
        :delay="8 * 50"
        transition="all ease-in-out duration-250"
      >
        <span bg-primary-600>600</span>
        <span bg-primary-700>700</span>
        <span bg-primary-800>800</span>
        <span bg-primary-900>900</span>
        <span bg-primary-950>950</span>
      </div>
    </div>
    <div
      v-motion
      class="color-bar transparency-grid"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (9 * 10)"
      :delay="9 * 50"
      transition="all ease-in-out duration-250"
    >
      <span bg="primary-500/5">500/5</span>
      <span bg="primary-500/10">500/10</span>
      <span bg="primary-500/20">500/20</span>
      <span bg="primary-500/30">500/30</span>
      <span bg="primary-500/40">500/40</span>
      <span bg="primary-500/50">500/50</span>
      <span bg="primary-500/60">500/60</span>
      <span bg="primary-500/70">500/70</span>
      <span bg="primary-500/80">500/80</span>
      <span bg="primary-500/90">500/90</span>
      <span bg="primary-500">500</span>
    </div>
  </Section>

  <Section
    v-motion title="settings.pages.themes.sections.section.theme-presets.title"
    icon="i-solar:magic-stick-2-bold-duotone"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (10 * 10)"
    :delay="10 * 50"
    transition="all ease-in-out duration-250"
  >
    <div
      v-for="({ title, description, colors }, i) in $tm('settings.pages.themes.sections.section.theme-presets.presets')" :key="i"
      v-motion
      class="w-full flex items-center justify-between rounded-lg px-4 py-3 outline-none transition-all duration-250 ease-in-out"
      bg="neutral-100 dark:neutral-800"
      hover="bg-neutral-200 dark:bg-neutral-700"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (11 * 10) + (i * 10)"
      :delay="11 * 50 + (i * 50)"
      transition="all ease-in-out duration-250"
    >
      <div>
        <span font-medium>{{ $rt(title) }}</span>
        <div text="sm neutral-500">
          {{ $rt(description) }}
        </div>
      </div>
      <ColorPalette :colors="(colors as any[]).map((name, j) => ({ hex: COLOR_PRESETS[i][j], name: $rt(name) }))" />
    </div>
  </Section>

  <Section
    v-motion title="settings.pages.themes.sections.section.developer.title"
    icon="i-solar:code-bold-duotone"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (18 * 10)"
    :delay="18 * 50"
    transition="all ease-in-out duration-250"
  >
    <CheckBar
      v-model="settings.disableTransitions"
      v-motion
      icon-on="i-solar:people-nearby-bold-duotone"
      icon-off="i-solar:running-2-line-duotone"
      text="settings.animations.stage-transitions.title"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (19 * 10)"
      :delay="19 * 50"
      transition="all ease-in-out duration-250"
    />
    <CheckBar
      v-model="settings.usePageSpecificTransitions"
      v-motion
      :disabled="settings.disableTransitions"
      icon-on="i-solar:running-2-line-duotone"
      icon-off="i-solar:people-nearby-bold-duotone"
      text="settings.animations.use-page-specific-transitions.title"
      description="settings.animations.use-page-specific-transitions.description"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (20 * 10)"
      :delay="20 * 50"
      transition="all ease-in-out duration-250"
    />
  </Section>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[65dvh]" right--15 z--1
    :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
    :enter="{ scale: 1, opacity: 1, rotate: 0 }"
    :duration="250"
    flex items-center justify-center
  >
    <div text="60" i-solar:filters-bold-duotone />
  </div>
</template>

<style scoped>
.theme-hue-slider {
  --at-apply: appearance-none h-10 rounded-lg;
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

  &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors duration-200;
  }

  .dark &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors duration-200;
  }

  &::-moz-range-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors duration-200;
  }

  .dark &::-moz-range-thumb {
    --at-apply: w-1 h-12 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors duration-200;
  }
}

.color-bar {
  --at-apply: flex of-hidden rounded-lg lh-10 text-center text-black;

  * {
    flex: 1;
  }

  div {
    display: contents;
  }
}

.transparency-grid {
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0px;
  background-color: #fff;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
