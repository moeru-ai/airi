<script setup lang="ts">
import { UTCDate } from '@date-fns/utc'
import { AboutContent, AboutDialog } from '@proj-airi/stage-ui/components'
import { abbreviatedSha, branch, committerDate } from '~build/git'
import { formatISO9075 } from 'date-fns'
import { computed, ref } from 'vue'

const show = ref(false)
const localDate = formatISO9075(new UTCDate(committerDate))
const buildInfo = computed(() => ({
  branch,
  commit: abbreviatedSha.substring(0, 7),
  builtOn: localDate,
}))
const aboutLinks = [
  { label: 'Home', href: 'https://airi.moeru.ai/docs/', icon: 'i-solar:home-smile-outline' },
  { label: 'Documentations', href: 'https://airi.moeru.ai/docs/en/docs/overview/', icon: 'i-solar:document-add-outline' },
  { label: 'GitHub', href: 'https://github.com/moeru-ai/airi', icon: 'i-simple-icons:github' },
]
</script>

<template>
  <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="About" @click="show = !show">
    <div i-solar:info-circle-outline size-5 text="neutral-500 dark:neutral-400" />
  </button>
  <AboutDialog v-model="show">
    <AboutContent subtitle="Web ver." :build-info="buildInfo" :links="aboutLinks" />
  </AboutDialog>
</template>
