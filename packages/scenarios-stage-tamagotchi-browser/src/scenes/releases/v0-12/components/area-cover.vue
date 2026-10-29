<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseShots } from './release-shots'

const stats = [
  { value: '530 MB', note: 'macOS download, from 870 MB' },
  { value: '+2', note: 'avatar formats: MMD and Tachie' },
  { value: '40', note: 'new contributors' },
  { value: 'ไทย', note: 'Thai is now available' },
]

// The cutouts fade out at the bottom edge of the area.
const fadeOut = { maskImage: 'linear-gradient(to bottom, black 78%, transparent)' }
</script>

<template>
  <ReleaseArea name="release-v0-12-cover">
    <div :class="['absolute inset-y-0 left-0 flex w-[560px] flex-col justify-center gap-6']">
      <ReleaseReveal :at="copyTimeline.eyebrow">
        <span :class="['text-sm font-semibold tracking-[0.14em] uppercase text-primary-500 dark:text-primary-300']">Project AIRI · Stable release</span>
      </ReleaseReveal>
      <ReleaseReveal :at="copyTimeline.title">
        <h1 :class="['text-[96px] leading-none font-bold tracking-tight font-sans-rounded']">
          AIRI <span :class="['text-primary-500 dark:text-primary-300']">v0.12</span>
        </h1>
      </ReleaseReveal>
      <ReleaseReveal :at="copyTimeline.lead">
        <p :class="['text-xl leading-relaxed text-neutral-500 dark:text-neutral-400']">
          New avatar formats, a rebuilt voice pipeline, tool calls you can read, and a much smaller desktop app.
        </p>
      </ReleaseReveal>
      <div :class="['grid grid-cols-2 gap-3']">
        <ReleaseReveal
          v-for="(stat, index) in stats"
          :key="stat.note"
          :at="copyTimeline.points + index * copyTimeline.pointStep"
        >
          <div :class="['flex flex-col gap-0.5 rounded-2xl px-4 py-3', 'bg-white dark:bg-[#161B22]']">
            <b :class="['text-2xl font-bold']">{{ stat.value }}</b>
            <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">{{ stat.note }}</span>
          </div>
        </ReleaseReveal>
      </div>
    </div>

    <ReleaseReveal :at="copyTimeline.visuals" :class="['absolute bottom-[-56px] left-[640px]']" :style="fadeOut">
      <ShotCrop :shot="releaseShots.stageMmd" :rect="[80, 30, 300, 570]" :scale="1" />
    </ReleaseReveal>
    <ReleaseReveal :at="copyTimeline.visuals + 150" :class="['absolute bottom-[-56px] left-[880px]']" :style="fadeOut">
      <ShotCrop :shot="releaseShots.stageVrm" :rect="[40, 10, 370, 590]" :scale="1" />
    </ReleaseReveal>
    <ReleaseReveal :at="copyTimeline.visuals + 300" :class="['absolute bottom-[-56px] right-[-40px]']" :style="fadeOut">
      <ShotCrop :shot="releaseShots.stageLive2dMagic2" :rect="[10, 20, 430, 580]" :scale="1" />
    </ReleaseReveal>
  </ReleaseArea>
</template>
