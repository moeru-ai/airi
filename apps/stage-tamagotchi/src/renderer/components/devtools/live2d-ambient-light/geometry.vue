<script setup lang="ts">
import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  screenAmbientLightBend,
  screenAmbientLightGap,
  screenAmbientLightFlatRadius,
} = storeToRefs(useSettingsScreenAmbientLight())

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatWidth(value: number) {
  return formatPercent(value * 2)
}
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.title')"
    icon="i-solar:monitor-bold-duotone"
    inner-class="gap-5"
  >
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.description') }}
    </p>
    <div :class="['grid gap-5', 'md:grid-cols-2']">
      <FieldRange
        v-model="screenAmbientLightBend"
        as="div"
        :min="0"
        :max="5"
        :step="0.05"
        :default-value="ambientLightDefaults.geometry.bend"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.bend.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.bend.description')"
      />
      <FieldRange
        v-model="screenAmbientLightGap"
        as="div"
        :min="0.01"
        :max="0.8"
        :step="0.01"
        :default-value="ambientLightDefaults.geometry.gap"
        :format-value="formatPercent"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.gap.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.gap.description')"
      />
      <FieldRange
        v-model="screenAmbientLightFlatRadius"
        as="div"
        :min="0"
        :max="0.6"
        :step="0.01"
        :default-value="ambientLightDefaults.geometry.flatRadius"
        :format-value="formatWidth"
        :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.flat-width.title')"
        :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.geometry.flat-width.description')"
      />
    </div>
  </Section>
</template>
