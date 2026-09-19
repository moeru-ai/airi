<script setup lang="ts">
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { formatMultiplier, formatPercent } from './format'

const { t } = useI18n()
const {
  screenAmbientLightBacklight,
  screenAmbientLightBaseCurve,
  screenAmbientLightColorBoost,
  screenAmbientLightDarkBase,
  screenAmbientLightLocalShare,
  screenAmbientLightTint,
  screenAmbientLightTranslucentWrap,
  screenAmbientLightWrapDiffuse,
  screenAmbientLightWrapIntensity,
  screenAmbientLightWrapSaturation,
} = storeToRefs(useSettingsScreenAmbientLight())
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="gap-5"
  >
    <div :class="['grid gap-5', 'md:grid-cols-2']">
      <FieldRange
        v-model="screenAmbientLightDarkBase"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.darkBase"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.dark-base.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.dark-base.description')"
      />
      <FieldRange
        v-model="screenAmbientLightBaseCurve"
        as="div"
        :min="0.25"
        :max="4"
        :step="0.05"
        :default-value="ambientLightDefaults.filter.baseCurve"
        :format-value="formatMultiplier"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-curve.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.base-curve.description')"
      />
      <FieldRange
        v-model="screenAmbientLightLocalShare"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.localShare"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.local-share.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.local-share.description')"
      />
      <FieldRange
        v-model="screenAmbientLightTint"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.tint"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.tint.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.tint.description')"
      />
      <FieldRange
        v-model="screenAmbientLightColorBoost"
        as="div"
        :min="0"
        :max="10"
        :step="0.1"
        :default-value="ambientLightDefaults.filter.colorBoost"
        :format-value="formatMultiplier"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.color-boost.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.color-boost.description')"
      />
      <FieldRange
        v-model="screenAmbientLightWrapIntensity"
        as="div"
        :min="0"
        :max="4"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.wrapIntensity"
        :format-value="formatMultiplier"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-intensity.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-intensity.description')"
      />
      <FieldRange
        v-model="screenAmbientLightWrapSaturation"
        as="div"
        :min="0"
        :max="1"
        :step="0.01"
        :default-value="ambientLightDefaults.filter.wrapSaturation"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-saturation.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.shader.wrap-saturation.description')"
      />
      <FieldRange
        v-model="screenAmbientLightBacklight"
        as="div"
        :min="0"
        :max="4"
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
