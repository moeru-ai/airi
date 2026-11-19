<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'

// The sticker grid continues below the crop, so it fades out at the bottom edge.
const fadeOut = { maskImage: 'linear-gradient(to bottom, black 82%, transparent)' }
</script>

<template>
  <ReleaseArea name="release-v0-12-stickers" :copy="releaseCopy.stickers" :copy-width="420">
    <ReleaseReveal :at="copyTimeline.visuals" :class="['absolute inset-y-0 right-0 overflow-hidden rounded-2xl']" :style="fadeOut">
      <ShotCrop :shot="releaseShots.settingsStickers" :rect="[10, 150, 1420, 760]" :scale="0.7" />
    </ReleaseReveal>
  </ReleaseArea>
</template>
