<script setup lang="ts">
import type { AboutBuildInfo, AboutLink } from '../about/types'

import AboutDialogBase from './about/about-dialog.vue'

import { AboutContent } from '../about'

withDefaults(defineProps<{
  title?: string
  highlight?: string
  subtitle?: string
  buildInfo?: AboutBuildInfo
  links?: AboutLink[]
}>(), {
  title: 'Project',
  highlight: 'AIRI',
  subtitle: '',
  links: undefined,
})

const showDialog = defineModel({ type: Boolean, default: false, required: false })
</script>

<template>
  <AboutDialogBase v-model="showDialog">
    <AboutContent
      :title="title"
      :highlight="highlight"
      :subtitle="subtitle"
      :build-info="buildInfo"
      :links="links"
    />
  </AboutDialogBase>
</template>
