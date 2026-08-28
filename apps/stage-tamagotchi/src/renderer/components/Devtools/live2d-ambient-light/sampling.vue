<script setup lang="ts">
import { live2dAmbientLightDefaults, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  live2dScreenAmbientLightBlackCutoff,
  live2dScreenAmbientLightCaptureIntervalMs,
  live2dScreenAmbientLightNeutralColorWeight,
  live2dScreenAmbientLightResponseMs,
  live2dScreenAmbientLightSampleHeight,
  live2dScreenAmbientLightSampleWidth,
  live2dScreenAmbientLightWhiteCutoff,
} = storeToRefs(useSettingsLive2d())

function formatMilliseconds(value: number) {
  return `${Math.round(value)} ms`
}

function formatPixels(value: number) {
  return `${Math.round(value)} px`
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
        v-model="live2dScreenAmbientLightCaptureIntervalMs"
        as="div"
        :min="50"
        :max="2000"
        :step="50"
        :default-value="live2dAmbientLightDefaults.captureIntervalMs"
        :format-value="formatMilliseconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.capture-interval.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.capture-interval.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightResponseMs"
        as="div"
        :min="50"
        :max="3000"
        :step="50"
        :default-value="live2dAmbientLightDefaults.responseMs"
        :format-value="formatMilliseconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.response-time.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.response-time.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightSampleWidth"
        as="div"
        :min="4"
        :max="64"
        :step="1"
        :default-value="live2dAmbientLightDefaults.sampleWidth"
        :format-value="formatPixels"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-width.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-width.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightSampleHeight"
        as="div"
        :min="4"
        :max="48"
        :step="1"
        :default-value="live2dAmbientLightDefaults.sampleHeight"
        :format-value="formatPixels"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-height.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.sample-height.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightBlackCutoff"
        as="div"
        :min="0"
        :max="0.3"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.sampling.blackCutoff"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.black-cutoff.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.black-cutoff.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightWhiteCutoff"
        as="div"
        :min="0.7"
        :max="1"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.sampling.whiteCutoff"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.white-cutoff.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.white-cutoff.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightNeutralColorWeight"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.sampling.neutralColorWeight"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.neutral-color-weight.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.sampling.neutral-color-weight.description')"
      />
    </div>
  </Section>
</template>
