<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { useI18n } from 'vue-i18n'

import DiagnosticsColors from './diagnostics-colors.vue'
import DiagnosticsMetrics from './diagnostics-metrics.vue'
import DiagnosticsPreview from './diagnostics-preview.vue'

import { useScreenAmbientLightDiagnostics } from '../../../composables/use-screen-ambient-light-diagnostics'

const { t } = useI18n()
const { diagnostics } = useScreenAmbientLightDiagnostics()
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.title')"
    icon="i-solar:bug-bold-duotone"
    inner-class="gap-5"
  >
    <template v-if="diagnostics">
      <DiagnosticsMetrics :diagnostics="diagnostics" />
      <DiagnosticsPreview
        :frame="diagnostics.frame"
        :excluded-region="diagnostics.excludedRegion"
      />
      <DiagnosticsColors :sampling="diagnostics.sampling" />
    </template>
    <div
      v-else
      :class="[
        'rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center',
        'text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400',
      ]"
    >
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.waiting') }}
    </div>
  </Section>
</template>
