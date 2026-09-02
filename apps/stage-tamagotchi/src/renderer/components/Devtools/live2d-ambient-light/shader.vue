<script setup lang="ts">
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  screenAmbientLightBacklight,
  screenAmbientLightBaseBrightness,
  screenAmbientLightBaseContrast,
  screenAmbientLightChroma,
  screenAmbientLightExposureRange,
  screenAmbientLightTranslucentWrap,
  screenAmbientLightWrapDiffuse,
  screenAmbientLightWrapIntensity,
} = storeToRefs(useSettingsScreenAmbientLight())

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatMultiplier(value: number) {
  return `${value.toFixed(2)}×`
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
        v-model="screenAmbientLightBaseBrightness"
        as="div"
        :min="0.2"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.baseBrightness"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-brightness.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-brightness.description')"
      />
      <FieldRange
        v-model="screenAmbientLightExposureRange"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.exposureRange"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.exposure-range.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.exposure-range.description')"
      />
      <FieldRange
        v-model="screenAmbientLightBaseContrast"
        as="div"
        :min="0.5"
        :max="2"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.baseContrast"
        :format-value="formatMultiplier"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-contrast.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-contrast.description')"
      />
      <FieldRange
        v-model="screenAmbientLightChroma"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.chroma"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.chroma.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.chroma.description')"
      />
      <FieldRange
        v-model="screenAmbientLightWrapIntensity"
        as="div"
        :min="0"
        :max="2"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.wrapIntensity"
        :format-value="formatMultiplier"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-intensity.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-intensity.description')"
      />
      <FieldRange
        v-model="screenAmbientLightBacklight"
        as="div"
        :min="0"
        :max="2"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.backlight"
        :format-value="formatMultiplier"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.backlight.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.backlight.description')"
      />
      <FieldRange
        v-model="screenAmbientLightWrapDiffuse"
        as="div"
        :min="0"
        :max="0.25"
        :step="0.005"
        :default-value="ambientLightDefaults.filter.wrapDiffuse"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-diffuse.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-diffuse.description')"
      />
    </div>

    <FieldCheckbox
      v-model="screenAmbientLightTranslucentWrap"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.translucent-wrap.title')"
      :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.translucent-wrap.description')"
    />
  </Section>
</template>
