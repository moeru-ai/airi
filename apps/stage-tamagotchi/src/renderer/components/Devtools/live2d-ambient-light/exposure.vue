<script setup lang="ts">
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  screenAmbientLightResponseCurve,
  screenAmbientLightPhysicalExposure,
  screenAmbientLightAdaptiveBloom,
  screenAmbientLightScreenNits,
  screenAmbientLightExposureCompensation,
  screenAmbientLightDarkAdaptation,
  screenAmbientLightBrightAdaptation,
} = storeToRefs(useSettingsScreenAmbientLight())
</script>

<template>
  <Section :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.title')" icon="i-solar:sun-bold-duotone" inner-class="gap-5">
    <FieldRange
      v-model="screenAmbientLightResponseCurve"
      as="div"
      :min="0"
      :max="100"
      :step="1"
      :default-value="ambientLightDefaults.exposure.responseCurve"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.response-curve.title')"
      :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.response-curve.description')"
    />
    <FieldCheckbox
      v-model="screenAmbientLightPhysicalExposure"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.enabled.title')"
      :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.enabled.description')"
    />
    <div v-if="screenAmbientLightPhysicalExposure" :class="['grid gap-5', 'md:grid-cols-2']">
      <FieldRange
        v-model="screenAmbientLightScreenNits"
        as="div"
        :min="0"
        :max="1000"
        :step="25"
        :default-value="ambientLightDefaults.exposure.screenNits"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.screen-nits.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.screen-nits.description')"
      />
      <FieldRange
        v-model="screenAmbientLightExposureCompensation"
        as="div"
        :min="-2"
        :max="2"
        :step="0.1"
        :default-value="ambientLightDefaults.exposure.compensation"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.compensation.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.compensation.description')"
      />
      <FieldRange
        v-model="screenAmbientLightDarkAdaptation"
        as="div"
        :min="0.5"
        :max="20"
        :step="0.5"
        :default-value="ambientLightDefaults.exposure.darkSeconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.dark-seconds.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.dark-seconds.description')"
      />
      <FieldRange
        v-model="screenAmbientLightBrightAdaptation"
        as="div"
        :min="0.1"
        :max="8"
        :step="0.1"
        :default-value="ambientLightDefaults.exposure.brightSeconds"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.bright-seconds.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.bright-seconds.description')"
      />
      <FieldCheckbox
        v-model="screenAmbientLightAdaptiveBloom"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.bloom.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.exposure.bloom.description')"
      />
    </div>
  </Section>
</template>
