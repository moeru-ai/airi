<script setup lang="ts">
import ReleaseArea from './release-area.vue'
import ReleaseReveal from './release-reveal.vue'
import ShotCrop from './shot-crop.vue'

import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'
import { copyTimeline } from './release-timeline'
</script>

<template>
  <ReleaseArea name="release-v0-12-live2d" :copy="releaseCopy.live2d" :copy-width="400">
    <div :class="['flex h-full items-center justify-end gap-6']">
      <div :class="['flex flex-col gap-3']">
        <div :class="['flex gap-3']">
          <ReleaseReveal :at="copyTimeline.visuals" :class="['overflow-hidden rounded-2xl bg-white dark:bg-[#161B22]']">
            <ShotCrop :shot="releaseShots.stageLive2dMagic1" :rect="[90, 40, 270, 400]" :scale="0.8" />
          </ReleaseReveal>
          <ReleaseReveal :at="copyTimeline.visuals + 300" :class="['overflow-hidden rounded-2xl bg-white dark:bg-[#161B22]']">
            <ShotCrop :shot="releaseShots.stageLive2dMagic2" :rect="[90, 40, 270, 400]" :scale="0.8" />
          </ReleaseReveal>
        </div>
        <ReleaseReveal :at="copyTimeline.visuals + 500" :class="['overflow-hidden rounded-2xl']">
          <ShotCrop :shot="releaseShots.settingsLive2dMagic" :rect="[18, 192, 564, 210]" :scale="0.78" />
        </ReleaseReveal>
      </div>

      <ReleaseReveal :at="copyTimeline.visuals + 700" :class="['overflow-hidden rounded-2xl']">
        <ShotCrop :shot="releaseShots.settingsLive2dImportReport" :rect="[0, 205, 600, 420]" :scale="0.86" />
      </ReleaseReveal>
    </div>
  </ReleaseArea>
</template>
