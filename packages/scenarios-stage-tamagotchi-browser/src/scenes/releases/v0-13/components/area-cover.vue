<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseShots } from './release-shots'

// From `git log v0.12.0..v0.13.0`, without bot commits.
const stats = [
  { value: '49', note: 'changes from 10 contributors' },
  { value: '4', note: 'first-time contributors' },
  { value: 'OTA', note: 'desktop updates, no new installer' },
  { value: '⌘F', note: 'search every setting' },
]

// The cutout fades out at the bottom edge of the area.
const fadeOut = { maskImage: 'linear-gradient(to bottom, black 78%, transparent)' }
</script>

<template>
  <ReleaseArea name="release-v0-13-cover">
    <div :class="['absolute inset-y-0 left-0 flex w-[560px] flex-col justify-center gap-6']">
      <ReleaseReveal :at="copyTimeline.eyebrow">
        <span :class="['text-sm font-semibold tracking-[0.14em] uppercase text-primary-500 dark:text-primary-300']">Project AIRI · Stable release</span>
      </ReleaseReveal>
      <ReleaseReveal :at="copyTimeline.title">
        <h1 :class="['text-[96px] leading-none font-bold tracking-tight font-sans-rounded']">
          AIRI <span :class="['text-primary-500 dark:text-primary-300']">v0.13</span>
        </h1>
      </ReleaseReveal>
      <ReleaseReveal :at="copyTimeline.lead">
        <p :class="['text-xl leading-relaxed text-neutral-500 dark:text-neutral-400']">
          Search for any setting, see what needs your attention, and get desktop updates over the air.
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

    <ReleaseReveal :at="copyTimeline.visuals" :class="['absolute bottom-[-56px] right-[-20px]']" :style="fadeOut">
      <ShotCrop :shot="releaseShots.stageLive2dMagic2" :rect="[10, 20, 430, 580]" :scale="1" />
    </ReleaseReveal>

    <div :class="['absolute left-[600px] top-[110px] flex w-[520px] flex-col gap-4']">
      <ReleaseReveal :at="copyTimeline.visuals + 150" :class="['overflow-hidden rounded-2xl shadow-xl shadow-black/10']">
        <ShotCrop :shot="releaseShots.settingsSearch" :rect="[16, 152, 600, 54]" :scale="0.8" />
      </ReleaseReveal>
      <ReleaseReveal :at="copyTimeline.visuals + 300" :class="['ml-10 overflow-hidden rounded-2xl shadow-xl shadow-black/10']">
        <ShotCrop :shot="releaseShots.settingsNeedsAttention" :rect="[16, 225, 600, 68]" :scale="0.8" />
      </ReleaseReveal>
      <ReleaseReveal :at="copyTimeline.visuals + 450" :class="['ml-16 overflow-hidden rounded-2xl shadow-xl shadow-black/10']">
        <ShotCrop :shot="releaseShots.desktopAbout" :rect="[56, 352, 488, 92]" :scale="0.85" />
      </ReleaseReveal>
    </div>
  </ReleaseArea>
</template>
