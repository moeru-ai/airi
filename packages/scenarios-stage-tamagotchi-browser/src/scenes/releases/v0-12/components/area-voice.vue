<script setup lang="ts">
import ReleaseArea from '../../components/release-area.vue'
import ReleaseReveal from '../../components/release-reveal.vue'
import ShotCrop from '../../components/shot-crop.vue'

import { copyTimeline } from '../../components/release-timeline'
import { releaseCopy } from './release-copy'
import { releaseShots } from './release-shots'

// The spoken text is the output of `toSpeechText` in `@proj-airi/core-agent` for this formula.
const formula = {
  tex: String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`,
  spoken: 'the integral from zero to one of x squared d x equals one over three',
}
</script>

<template>
  <ReleaseArea name="release-v0-12-voice" :copy="releaseCopy.voice" :copy-width="440">
    <div :class="['flex h-full flex-col justify-center gap-5']">
      <ReleaseReveal :at="copyTimeline.visuals" :class="['overflow-hidden rounded-2xl']">
        <ShotCrop :shot="releaseShots.settingsHearing" :rect="[10, 150, 1420, 120]" :scale="0.69" />
      </ReleaseReveal>

      <div :class="['flex gap-5']">
        <ReleaseReveal :at="copyTimeline.visuals + 250" :class="['flex flex-col gap-2']">
          <span :class="['text-sm text-neutral-500']">Wake words, on the character card</span>
          <div :class="['overflow-hidden rounded-2xl']">
            <ShotCrop :shot="releaseShots.settingsWakeWords" :rect="[16, 266, 696, 206]" :scale="0.8" />
          </div>
        </ReleaseReveal>

        <ReleaseReveal :at="copyTimeline.visuals + 450" :class="['flex min-w-0 flex-1 flex-col gap-2']">
          <span :class="['text-sm text-neutral-500']">Formulas, read aloud</span>
          <div :class="['flex flex-1 flex-col justify-center gap-3 rounded-2xl px-5 py-4', 'bg-white dark:bg-[#161B22]']">
            <code :class="['font-mono text-sm text-neutral-500 dark:text-neutral-400']">{{ formula.tex }}</code>
            <p :class="['text-base leading-snug text-neutral-900 dark:text-neutral-100']">
              “{{ formula.spoken }}”
            </p>
            <span :class="['text-xs text-neutral-500']">Also in Chinese, Japanese, and Korean</span>
          </div>
        </ReleaseReveal>
      </div>
    </div>
  </ReleaseArea>
</template>
