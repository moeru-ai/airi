<script setup lang="ts">
import { live2dAmbientLightDefaults, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  live2dScreenAmbientLightBaseBrightness,
  live2dScreenAmbientLightHighlightCoverage,
  live2dScreenAmbientLightHighlightStrength,
  live2dScreenAmbientLightTintCoverage,
  live2dScreenAmbientLightTintStrength,
} = storeToRefs(useSettingsLive2d())

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="gap-5"
  >
    <div :class="['grid gap-5', 'md:grid-cols-2']">
      <FieldRange
        v-model="live2dScreenAmbientLightBaseBrightness"
        as="div"
        :min="0.5"
        :max="1"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.filter.baseBrightness"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-brightness.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-brightness.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightTintCoverage"
        as="div"
        :min="0.1"
        :max="1"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.filter.tintCoverage"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.tint-coverage.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.tint-coverage.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightHighlightCoverage"
        as="div"
        :min="0.05"
        :max="0.8"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.filter.highlightCoverage"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.highlight-coverage.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.highlight-coverage.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightTintStrength"
        as="div"
        :min="0"
        :max="0.5"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.filter.tintStrength"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.tint-strength.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.tint-strength.description')"
      />
      <FieldRange
        v-model="live2dScreenAmbientLightHighlightStrength"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="live2dAmbientLightDefaults.filter.highlightStrength"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.highlight-strength.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.highlight-strength.description')"
      />
    </div>
  </Section>
</template>
