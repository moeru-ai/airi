<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'

/** What happens to a downloaded update, in order. */
const steps = [
  { icon: 'i-ph:seal-check-duotone', title: 'Signed bundle', note: 'AIRI checks the signature before it applies the update' },
  { icon: 'i-ph:arrows-clockwise-duotone', title: 'Reload or restart', note: 'A page-only update reloads the windows in place' },
  { icon: 'i-ph:heartbeat-duotone', title: 'Health check', note: 'The new version must start every module and the main window' },
  { icon: 'i-ph:arrow-u-up-left-duotone', title: 'Roll back', note: 'If it does not, AIRI goes back to the previous version' },
]
</script>

<template>
  <ReleaseArea name="release-v0-13-desktop-updates" :copy="releaseCopy.desktopUpdates" :copy-width="420">
    <div :class="['flex h-full items-center justify-end gap-6']">
      <ReleaseReveal :at="copyTimeline.visuals" :class="['overflow-hidden rounded-2xl']">
        <ShotCrop :shot="releaseShots.desktopAbout" :rect="[56, 216, 488, 232]" :scale="1.04" />
      </ReleaseReveal>

      <ol :class="['flex w-[400px] flex-col gap-3']">
        <ReleaseReveal
          v-for="(step, index) in steps"
          :key="step.title"
          :at="copyTimeline.visuals + 250 + index * 120"
        >
          <li :class="['flex items-start gap-3 rounded-2xl px-4 py-3', 'bg-white dark:bg-[#161B22]']">
            <span :class="[step.icon, 'mt-0.5 shrink-0 text-xl text-primary-500 dark:text-primary-300']" />
            <span :class="['flex flex-col gap-0.5']">
              <b :class="['text-base font-semibold']">{{ step.title }}</b>
              <span :class="['text-sm leading-snug text-neutral-500 dark:text-neutral-400']">{{ step.note }}</span>
            </span>
          </li>
        </ReleaseReveal>
      </ol>
    </div>
  </ReleaseArea>
</template>
