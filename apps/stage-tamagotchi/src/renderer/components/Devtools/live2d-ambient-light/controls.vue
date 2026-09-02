<script setup lang="ts">
import type { ScreenAmbientLightMode, ScreenAmbientLightSource } from '@proj-airi/stage-shared/screen-ambient-light'
import type { SelectTabOption } from '@proj-airi/ui'

import { ambientLightDefaults } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { ColorPicker, Section } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, FieldRange, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  screenAmbientLightEnabled,
  screenAmbientLightForcedColor,
  screenAmbientLightMode,
  screenAmbientLightSource,
  screenAmbientLightStrength,
} = storeToRefs(useSettingsScreenAmbientLight())

const sourceOptions = computed<SelectTabOption<ScreenAmbientLightSource>[]>(() => [
  {
    value: 'screen-capture',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.source.options.screen-capture'),
  },
  {
    value: 'forced-color',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.source.options.forced-color'),
  },
])
const modeOptions = computed<SelectTabOption<ScreenAmbientLightMode>[]>(() => [
  {
    value: 'window-gradient',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.mode.options.window-gradient'),
  },
  {
    value: 'global',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.mode.options.global'),
  },
])

function formatMultiplier(value: number) {
  return `${value.toFixed(2)}×`
}
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.controls.title')"
    icon="i-solar:lightbulb-bolt-bold-duotone"
    inner-class="gap-4"
  >
    <FieldCheckbox
      v-model="screenAmbientLightEnabled"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.enabled.title')"
      :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.enabled.description')"
    />

    <div :class="['grid gap-4', 'md:grid-cols-2']">
      <label :class="['flex flex-col gap-2']">
        <span :class="['text-sm font-medium']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.source.title') }}
        </span>
        <SelectTab v-model="screenAmbientLightSource" :options="sourceOptions" size="sm" />
      </label>

      <label :class="['flex flex-col gap-2']">
        <span :class="['text-sm font-medium']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.mode.title') }}
        </span>
        <SelectTab v-model="screenAmbientLightMode" :options="modeOptions" size="sm" />
      </label>
    </div>

    <div
      v-if="screenAmbientLightSource === 'forced-color'"
      :class="[
        'grid items-center gap-3', 'sm:grid-cols-[1fr_auto]',
        'rounded-xl px-3 py-3',
        'bg-neutral-100/70 dark:bg-neutral-800/70',
      ]"
    >
      <div>
        <div :class="['text-sm font-medium']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.forced-color.title') }}
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.forced-color.description') }}
        </div>
      </div>
      <div :class="['flex items-center justify-end gap-3']">
        <div
          :class="['size-9 rounded-lg border border-neutral-300 dark:border-neutral-700']"
          :style="{ backgroundColor: screenAmbientLightForcedColor }"
        />
        <ColorPicker v-model="screenAmbientLightForcedColor" :alpha="false" />
      </div>
    </div>

    <FieldRange
      v-model="screenAmbientLightStrength"
      as="div"
      :min="0"
      :max="3"
      :step="0.01"
      :default-value="ambientLightDefaults.strength"
      :format-value="formatMultiplier"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.strength.title')"
      :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.strength.description')"
    />

    <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.main-window-note') }}
    </div>
  </Section>
</template>
