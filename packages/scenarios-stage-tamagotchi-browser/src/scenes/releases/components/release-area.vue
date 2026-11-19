<script setup lang="ts">
import type { AreaCopy } from './release-copy'

import { RouterCaptureRoot } from '@vishot/mockup-desktop-vue'
import { inject } from 'vue'

import ReleaseReveal from './release-reveal.vue'

import { releaseThemeKey } from './release-theme'
import { copyTimeline } from './release-timeline'

/**
 * One shareable release area: a 1600x640 (2.5:1) capture root with a copy column and a visual stage.
 * Vishot exports it as `<name>-<theme>.png`, for example `release-v0-12-voice-dark.png`.
 * The default slot is the visual stage. Place its layers with `ReleaseReveal`.
 * The area uses `font-cute`, the font of the stage layout.
 */
const props = withDefaults(defineProps<{
  name: string
  copy?: AreaCopy
  copyWidth?: number
}>(), {
  copyWidth: 420,
})

const theme = inject(releaseThemeKey, 'dark')
</script>

<template>
  <RouterCaptureRoot :name="`${props.name}-${theme}`">
    <div
      :class="[
        'relative flex gap-12 overflow-hidden px-16 py-14',
        'w-[1600px] h-[640px]',
        'bg-[#F6F8FA] text-neutral-900 dark:bg-[#0D1117] dark:text-neutral-100 font-cute',
      ]"
    >
      <div
        v-if="props.copy"
        :class="['flex shrink-0 flex-col justify-center gap-5']"
        :style="{ width: `${props.copyWidth}px` }"
      >
        <ReleaseReveal :at="copyTimeline.eyebrow">
          <span :class="['text-sm font-semibold tracking-[0.14em] uppercase text-primary-500 dark:text-primary-300']">{{ props.copy.eyebrow }}</span>
        </ReleaseReveal>

        <ReleaseReveal :at="copyTimeline.title">
          <h2 :class="['text-[46px] leading-[1.08] font-bold tracking-tight']">
            <span
              v-for="run in props.copy.title"
              :key="run.text"
              :class="[run.accent ? 'text-primary-500 dark:text-primary-300' : '']"
            >{{ run.text }}</span>
          </h2>
        </ReleaseReveal>

        <ReleaseReveal v-if="props.copy.lead" :at="copyTimeline.lead">
          <p :class="['text-lg leading-relaxed text-neutral-500 dark:text-neutral-400']">
            {{ props.copy.lead }}
          </p>
        </ReleaseReveal>

        <ul v-if="props.copy.points" :class="['flex flex-col gap-2.5']">
          <ReleaseReveal
            v-for="(point, index) in props.copy.points"
            :key="point.text"
            :at="copyTimeline.points + index * copyTimeline.pointStep"
          >
            <li :class="['flex gap-3 text-base leading-snug text-neutral-700 dark:text-neutral-300']">
              <span :class="['mt-2 size-1.5 shrink-0 rounded-full bg-primary-500 dark:bg-primary-400']" />
              <span><b v-if="point.strong" :class="['mr-1 font-semibold text-neutral-900 dark:text-neutral-100']">{{ point.strong }}</b>{{ point.text }}</span>
            </li>
          </ReleaseReveal>
        </ul>

        <ReleaseReveal
          v-if="props.copy.chips"
          :at="copyTimeline.points + (props.copy.points?.length ?? 0) * copyTimeline.pointStep"
        >
          <div :class="['flex flex-wrap gap-2']">
            <span
              v-for="chip in props.copy.chips"
              :key="chip"
              :class="['rounded-full px-3 py-1 text-sm font-medium', 'bg-white text-neutral-700 dark:bg-[#161B22] dark:text-neutral-200']"
            >{{ chip }}</span>
          </div>
        </ReleaseReveal>
      </div>

      <div :class="['relative min-w-0 flex-1']">
        <slot />
      </div>
    </div>
  </RouterCaptureRoot>
</template>
