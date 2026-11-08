<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'

/** The fixes that people asked about most. The release notes list the others. */
const fixes = [
  { icon: 'i-ph:user-circle-check-duotone', title: 'Remembers your character', note: 'AIRI opens with the character you picked last.' },
  { icon: 'i-ph:speaker-high-duotone', title: 'Replies speak again', note: 'After sign-in, and with AIRI open in several tabs.' },
  { icon: 'i-ph:wrench-duotone', title: 'Long tool tasks finish', note: 'A reply no longer stops after 10 tool steps.' },
  { icon: 'i-ph:cursor-click-duotone', title: 'Settings links respond', note: 'Also with page transitions turned on.' },
]
</script>

<template>
  <ReleaseArea name="release-v0-13-fixes" :copy="releaseCopy.fixes" :copy-width="400">
    <div :class="['flex h-full flex-col items-end justify-center gap-4']">
      <ReleaseReveal :at="copyTimeline.visuals" :class="['flex flex-col gap-2']">
        <span :class="['text-sm text-neutral-500']">Settings → Modules → Web Search</span>
        <div :class="['overflow-hidden rounded-2xl']">
          <ShotCrop :shot="releaseShots.settingsWebSearch" :rect="[16, 150, 1408, 276]" :scale="0.7" />
        </div>
      </ReleaseReveal>

      <ReleaseReveal :at="copyTimeline.visuals + 300" :class="['w-[986px]']">
        <span :class="['text-sm text-neutral-500']">Fixes you will notice</span>
      </ReleaseReveal>
      <ul :class="['grid w-[986px] grid-cols-2 gap-3']">
        <ReleaseReveal
          v-for="(fix, index) in fixes"
          :key="fix.title"
          :at="copyTimeline.visuals + 350 + index * 120"
        >
          <li :class="['flex h-full items-start gap-3 rounded-2xl px-4 py-3', 'bg-white dark:bg-[#161B22]']">
            <span :class="[fix.icon, 'mt-0.5 shrink-0 text-xl text-primary-500 dark:text-primary-300']" />
            <span :class="['flex flex-col gap-0.5']">
              <b :class="['text-base font-semibold']">{{ fix.title }}</b>
              <span :class="['text-sm leading-snug text-neutral-500 dark:text-neutral-400']">{{ fix.note }}</span>
            </span>
          </li>
        </ReleaseReveal>
      </ul>
    </div>
  </ReleaseArea>
</template>
