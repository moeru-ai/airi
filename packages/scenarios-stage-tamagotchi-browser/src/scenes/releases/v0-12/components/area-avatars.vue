<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'

const cards = [
  { shot: releaseShots.stageMmd, label: 'MMD', note: 'New · CG-CA Gene, CC BY 4.0' },
  { shot: releaseShots.stageTachie, label: 'Tachie', note: 'New · .tachie.zip' },
  { shot: releaseShots.stageVrm, label: 'VRM', note: 'Click reactions' },
  { shot: releaseShots.stageLive2dMagic2, label: 'Live2D', note: 'MAGIC motion' },
]

// A progressive blur under each label: full blur at the bottom, none at the top.
const progressiveBlur = { maskImage: 'linear-gradient(to top, black 45%, transparent)' }
</script>

<template>
  <ReleaseArea name="release-v0-12-avatars" :copy="releaseCopy.avatars" :copy-width="400">
    <div :class="['flex h-full items-stretch justify-end gap-4']">
      <ReleaseReveal
        v-for="(card, index) in cards"
        :key="card.label"
        :at="copyTimeline.visuals + index * 120"
        :class="['relative overflow-hidden rounded-3xl bg-white dark:bg-[#161B22]']"
      >
        <ShotCrop :shot="card.shot" :rect="[95, 0, 260, 600]" :scale="0.88" />
        <div :class="['absolute inset-x-0 bottom-0 h-32 backdrop-blur-md bg-white/40 dark:bg-[#161B22]/80']" :style="progressiveBlur" />
        <div :class="['absolute inset-x-0 bottom-0 flex flex-col px-5 pb-4 text-neutral-900 dark:text-neutral-100']">
          <b :class="['text-xl font-bold']">{{ card.label }}</b>
          <span :class="['text-xs text-neutral-600 dark:text-neutral-400']">{{ card.note }}</span>
        </div>
      </ReleaseReveal>
    </div>
  </ReleaseArea>
</template>
