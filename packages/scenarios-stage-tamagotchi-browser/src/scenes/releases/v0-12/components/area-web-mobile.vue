<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'
</script>

<template>
  <ReleaseArea name="release-v0-12-web-mobile" :copy="releaseCopy.webMobile" :copy-width="420">
    <ReleaseReveal :at="copyTimeline.visuals" :class="['absolute left-0 top-[52px] overflow-hidden rounded-xl bg-neutral-200 dark:bg-[#161B22]']">
      <div :class="['flex h-7 items-center gap-1.5 px-3']">
        <span v-for="dot in 3" :key="dot" :class="['size-2.5 rounded-full bg-neutral-300 dark:bg-neutral-700']" />
      </div>
      <ShotCrop :shot="releaseShots.webStageChat" :rect="[0, 0, 1440, 900]" :scale="0.44" />
    </ReleaseReveal>

    <ReleaseReveal :at="copyTimeline.visuals + 250" :class="['absolute right-[250px] top-0 rounded-[36px] bg-neutral-300 p-2 dark:bg-neutral-800']">
      <ShotCrop :shot="releaseShots.mobileChat" :rect="[0, 0, 390, 844]" :scale="0.58" :class="['rounded-[28px]']" />
    </ReleaseReveal>

    <ReleaseReveal :at="copyTimeline.visuals + 450" :class="['absolute right-0 top-[22px] rounded-[36px] bg-neutral-300 p-2 dark:bg-neutral-800']">
      <ShotCrop :shot="releaseShots.mobileMenu" :rect="[0, 0, 390, 844]" :scale="0.58" :class="['rounded-[28px]']" />
    </ReleaseReveal>
  </ReleaseArea>
</template>
