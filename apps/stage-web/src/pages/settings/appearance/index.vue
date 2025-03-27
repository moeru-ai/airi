<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useDark } from '@vueuse/core'
import { watch } from 'vue'
import { useRouter } from 'vue-router'

import CheckBar from '../../../components/Settings/CheckBar.vue'
import ColorPalette from '../../../components/Settings/ColorPalette.vue'
import Section from '../../../components/Settings/Section.vue'
import { useIconAnimation } from '../../../composables/useIconAnimation'
import COLOR_PRESETS from './color-presets.json'

const router = useRouter()
const settings = useSettings()
const dark = useDark()

const { showIconAnimation, showAnimationComponent, animationIcon } = useIconAnimation('i-lucide:paintbrush')

watch(() => settings.useIconAnimation, (value) => {
  if (value) {
    showAnimationComponent.value = false
    showIconAnimation.value = true
  }
})
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500" text-nowrap>{{ $t('settings.title') }}</span>
      </div>
      <div text-nowrap text-3xl font-semibold>
        {{ $t('settings.pages.themes.title') }}
      </div>
    </h1>
  </div>

  <Section title="settings.sections.section.general.title" icon="i-solar:filters-bold-duotone">
    <!-- Theme Setting -->
    <CheckBar
      v-model="dark"
      icon-on="i-solar:moon-stars-bold-duotone"
      icon-off="i-solar:sun-fog-bold-duotone"
      text="settings.theme"
    />
    <!-- Language Setting -->
    <div
      class="setting-bar text-sm"
      bg="neutral-50 dark:neutral-800"
      hover="bg-neutral-200 dark:bg-neutral-700"
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

  <Section title="settings.pages.themes.sections.section.custom-color.title" icon="i-solar:pallete-2-bold-duotone">
    <div flex items-center justify-between>
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
      type="range" min="0" max="360" step="0.01" class="theme-hue-slider"
      :disabled="settings.themeColorsHueDynamic"
      :class="settings.themeColorsHueDynamic ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer'"
    >
    <div class="color-bar">
      <span bg-primary-50>50</span>
      <span bg-primary-100>100</span>
      <span bg-primary-200>200</span>
      <span bg-primary-300>300</span>
      <span bg-primary-400>400</span>
      <span bg-primary-500>500</span>
      <div text-white>
        <span bg-primary-600>600</span>
        <span bg-primary-700>700</span>
        <span bg-primary-800>800</span>
        <span bg-primary-900>900</span>
        <span bg-primary-950>950</span>
      </div>
    </div>
    <div class="color-bar transparency-grid">
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

  <Section title="settings.pages.themes.sections.section.theme-presets.title" icon="i-solar:magic-stick-2-bold-duotone">
    <div
      v-for="({ title, description, colors }, i) in $tm('settings.pages.themes.sections.section.theme-presets.presets')" :key="i"
      class="setting-bar"
      bg="neutral-100 dark:neutral-800"
      hover="bg-neutral-200 dark:bg-neutral-700"
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

  <Section title="settings.pages.themes.sections.section.developer.title" icon="i-solar:code-bold-duotone">
    <CheckBar
      v-model="settings.disableTransitions"
      icon-on="i-solar:people-nearby-bold-duotone"
      icon-off="i-solar:running-2-line-duotone"
      text="settings.animations.stage-transitions.title"
    />
    <CheckBar
      v-model="settings.useIconAnimation"
      icon-on="i-solar:people-nearby-bold-duotone"
      icon-off="i-solar:running-2-line-duotone"
      text="settings.animations.use-icon-animation.title"
    />
  </Section>

  <IconAnimation
    v-if="showAnimationComponent && settings.useIconAnimation"
    :duration="1000"
    :started="showIconAnimation"
    :is-reverse="true"
    :icon="animationIcon"
    :icon-size="12"
    position="calc(100dvw - 9.5rem), calc(100dvh - 9.5rem)"
    text-color="text-neutral-200/50 dark:text-neutral-600/20"
  />
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
    --at-apply: appearance-none w-2 h-12 rounded-md bg-neutral-500/80 dark: bg-neutral-400/80 shadow-md border-2
      border-white hover: bg-neutral-500 dark: hover: bg-neutral-400 transition-colors duration-200;
  }

  &::-moz-range-thumb {
    --at-apply: w-2 h-12 rounded-md bg-neutral-500/80 dark: bg-neutral-400/80 shadow-md border-2 border-white border-box
      hover: bg-neutral-500 dark: hover: bg-neutral-400 transition-colors duration-200;
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
  stageTransition:
    name: slide
</route>
