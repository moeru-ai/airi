<script setup lang="ts">
import { ColorPalette, Section } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { ColorHueRange } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import COLOR_PRESETS from './color-presets.json'

const settings = useSettings()
const { t } = useI18n()
</script>

<template>
  <Section
    v-motion
    mb-2
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
      <span text-lg font-normal>{{ $t('settings.pages.themes.sections.section.custom-color.fields.field.primary-color.label') }}</span>
      <label relative flex cursor-pointer items-center gap-2>
        <input
          v-model="settings.themeColorsHueDynamic"
          type="checkbox"
          class="peer sr-only"
        >
        <div
          class="h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white dark:bg-neutral-600 peer-checked:bg-primary-500 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"
        />
        {{ $t('settings.pages.themes.sections.section.custom-color.fields.field.primary-color.rgb-on.title') }}
      </label>
    </div>
    <ColorHueRange
      v-model="settings.themeColorsHue"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (6 * 10)"
      :delay="6 * 50"
      :disabled="settings.themeColorsHueDynamic"
    />
    <div
      v-motion
      class="color-bar text-[10px] md:text-base sm:text-xs"
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
      class="color-bar transparency-grid text-[10px] md:text-base sm:text-xs"
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
    v-motion
    mb-2 :title="t('settings.pages.themes.sections.section.theme-presets.title')"
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
      class="w-full flex flex-col items-start justify-between gap-2 rounded-lg px-4 py-3 outline-none transition-all duration-250 ease-in-out md:flex-row md:items-center md:gap-0"
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

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[65dvh]" right--15 z--1
    :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
    :enter="{ scale: 1, opacity: 1, rotate: 0 }"
    :duration="250"
    flex items-center justify-center
  >
    <div text="60" i-solar:pallete-2-bold-duotone />
  </div>
</template>

<style scoped>
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
</route>
