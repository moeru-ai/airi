<script setup lang="ts">
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  screenAmbientLightCaptureIntervalMs,
  screenAmbientLightNeutralColorWeight,
  screenAmbientLightResponseMs,
  screenAmbientLightSampleHeight,
  screenAmbientLightSampleWidth,
} = storeToRefs(useSettingsScreenAmbientLight())

function formatMilliseconds(value: number) {
  return `${Math.round(value)} ms`
}

function formatPixels(value: number) {
  return `${Math.round(value)} px`
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.title')"
    icon="i-solar:screen-share-bold-duotone"
    inner-class="gap-5"
  >
    <div :class="['grid gap-5', 'md:grid-cols-2']">
      <FieldRange
        v-model="screenAmbientLightCaptureIntervalMs"
        as="div"
        :min="50"
        :max="2000"
        :step="50"
        :default-value="ambientLightDefaults.captureIntervalMs"
        :format-value="formatMilliseconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.capture-interval.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.capture-interval.description')"
      />
      <FieldRange
        v-model="screenAmbientLightResponseMs"
        as="div"
        :min="50"
        :max="3000"
        :step="50"
        :default-value="ambientLightDefaults.responseMs"
        :format-value="formatMilliseconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.response-time.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.response-time.description')"
      />
      <FieldRange
        v-model="screenAmbientLightSampleWidth"
        as="div"
        :min="32"
        :max="256"
        :step="8"
        :default-value="ambientLightDefaults.sampleWidth"
        :format-value="formatPixels"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-width.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-width.description')"
      />
      <FieldRange
        v-model="screenAmbientLightSampleHeight"
        as="div"
        :min="24"
        :max="192"
        :step="8"
        :default-value="ambientLightDefaults.sampleHeight"
        :format-value="formatPixels"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-height.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-height.description')"
      />
      <FieldRange
        v-model="screenAmbientLightNeutralColorWeight"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.sampling.neutralColorWeight"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.neutral-color-weight.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.neutral-color-weight.description')"
      />
    </div>
  </Section>
</template>
