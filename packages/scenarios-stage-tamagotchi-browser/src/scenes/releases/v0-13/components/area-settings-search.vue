<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'
</script>

<template>
  <ReleaseArea name="release-v0-13-settings-search" :copy="releaseCopy.settingsSearch" :copy-width="400">
    <div :class="['flex h-full flex-col items-end justify-center gap-4']">
      <ReleaseReveal :at="copyTimeline.visuals" :class="['overflow-hidden rounded-2xl']">
        <ShotCrop :shot="releaseShots.settingsSearch" :rect="[16, 150, 1408, 545]" :scale="0.6" />
      </ReleaseReveal>

      <ReleaseReveal :at="copyTimeline.visuals + 350" :class="['flex flex-col gap-2']">
        <span :class="['text-sm text-neutral-500']">Open a result, land on the row</span>
        <div :class="['overflow-hidden rounded-2xl']">
          <ShotCrop :shot="releaseShots.settingsSearchOpen" :rect="[16, 735, 1408, 125]" :scale="0.6" />
        </div>
      </ReleaseReveal>
    </div>
  </ReleaseArea>
</template>
