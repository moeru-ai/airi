<script setup lang="ts">
import { UTCDate } from '@date-fns/utc'
import { AboutContent } from '@proj-airi/stage-ui/components'
import { abbreviatedSha, branch, committerDate } from '~build/git'
import { formatISO9075 } from 'date-fns'
import { computed } from 'vue'

import packageJson from '../../../package.json'

const buildInfo = computed(() => ({
  version: packageJson.version,
  branch,
  commit: abbreviatedSha.substring(0, 7),
  builtOn: formatISO9075(new UTCDate(committerDate)),
}))
</script>

<template>
  <div
    :class="[
      'min-h-100dvh',
      'min-w-100dvw',
      'bg-neutral-50/80',
      'text-neutral-800',
      'dark:bg-neutral-900',
      'dark:text-neutral-100',
    ]"
  >
    <div :class="['mx-auto max-w-6xl', 'px-6 py-10']">
      <AboutContent subtitle="Desktop ver." :build-info="buildInfo" />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
