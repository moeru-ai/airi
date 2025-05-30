<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useI18n } from 'vue-i18n'

const settings = useSettings()
const { t } = useI18n()
</script>

<template>
  <Section
    v-motion
    mb-2 :title="t('settings.pages.themes.sections.section.developer.title')"
    icon="i-solar:code-bold-duotone"
    :initial="{ opacity: 0, y: 10 }"
    :enter="{ opacity: 1, y: 0 }"
    :duration="250 + (18 * 10)"
    :delay="18 * 50"
    transition="all ease-in-out duration-250"
  >
    <CheckBar
      v-model="settings.disableTransitions"
      v-motion
      icon-on="i-solar:people-nearby-bold-duotone"
      icon-off="i-solar:running-2-line-duotone"
      text="settings.animations.stage-transitions.title"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (19 * 10)"
      :delay="19 * 50"
      transition="all ease-in-out duration-250"
    />
    <CheckBar
      v-model="settings.usePageSpecificTransitions"
      v-motion
      :disabled="settings.disableTransitions"
      icon-on="i-solar:running-2-line-duotone"
      icon-off="i-solar:people-nearby-bold-duotone"
      text="settings.animations.use-page-specific-transitions.title"
      description="settings.animations.use-page-specific-transitions.description"
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (20 * 10)"
      :delay="20 * 50"
      transition="all ease-in-out duration-250"
    />
  </Section>
</template>
