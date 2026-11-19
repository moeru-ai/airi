<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'
</script>

<template>
  <ReleaseArea name="release-v0-13-needs-attention" :copy="releaseCopy.needsAttention" :copy-width="400">
    <div :class="['flex h-full flex-col items-end justify-center gap-4']">
      <ReleaseReveal :at="copyTimeline.visuals" :class="['overflow-hidden rounded-2xl']">
        <ShotCrop :shot="releaseShots.settingsNeedsAttention" :rect="[16, 222, 1408, 246]" :scale="0.7" />
      </ReleaseReveal>

      <ReleaseReveal :at="copyTimeline.visuals + 350" :class="['flex flex-col gap-2']">
        <span :class="['flex items-center gap-1.5 text-sm text-neutral-500']">
          <span :class="['i-ph:cursor-click-duotone text-base']" />
          Edit on “ReLU has no voice” opens the voice of the character
        </span>
        <div :class="['overflow-hidden rounded-2xl']">
          <ShotCrop :shot="releaseShots.settingsNeedsAttentionEdit" :rect="[280, 664, 1104, 212]" :scale="0.893" />
        </div>
      </ReleaseReveal>
    </div>
  </ReleaseArea>
</template>
