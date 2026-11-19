<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'
</script>

<template>
  <ReleaseArea name="release-v0-12-tool-calls" :copy="releaseCopy.toolCalls" :copy-width="400">
    <div :class="['flex h-full items-center justify-end gap-5']">
      <ReleaseReveal :at="copyTimeline.visuals" :class="['flex flex-col gap-2']">
        <span :class="['text-sm text-neutral-500']">Web search</span>
        <div :class="['overflow-hidden rounded-2xl']">
          <ShotCrop :shot="releaseShots.chatToolCalls" :rect="[10, 58, 490, 466]" :scale="1" />
        </div>
      </ReleaseReveal>
      <ReleaseReveal :at="copyTimeline.visuals + 400" :class="['flex flex-col gap-2']">
        <span :class="['text-sm text-neutral-500']">Home Assistant</span>
        <div :class="['overflow-hidden rounded-2xl']">
          <ShotCrop :shot="releaseShots.chatToolCalls" :rect="[10, 570, 442, 356]" :scale="1.02" />
        </div>
      </ReleaseReveal>
    </div>
  </ReleaseArea>
</template>
