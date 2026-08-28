<script setup lang="ts">
import type { Live2DScreenAmbientLightMode, Live2DScreenAmbientLightSource } from '@proj-airi/stage-ui-live2d'
import type { SelectTabOption } from '@proj-airi/ui'

import { live2dAmbientLightDefaults, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { ColorPicker, Section } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, FieldRange, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const {
  live2dScreenAmbientLightEnabled,
  live2dScreenAmbientLightForcedColor,
  live2dScreenAmbientLightMode,
  live2dScreenAmbientLightSource,
  live2dScreenAmbientLightStrength,
} = storeToRefs(useSettingsLive2d())

const sourceOptions = computed<SelectTabOption<Live2DScreenAmbientLightSource>[]>(() => [
  {
    value: 'screen-capture',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.source.options.screen-capture'),
  },
  {
    value: 'forced-color',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.source.options.forced-color'),
  },
])
const modeOptions = computed<SelectTabOption<Live2DScreenAmbientLightMode>[]>(() => [
  {
    value: 'window-gradient',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.mode.options.window-gradient'),
  },
  {
    value: 'global',
    label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.mode.options.global'),
  },
])
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.controls.title')"
    icon="i-solar:lightbulb-bolt-bold-duotone"
    inner-class="gap-4"
  >
    <FieldCheckbox
      v-model="live2dScreenAmbientLightEnabled"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.enabled.title')"
      :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.enabled.description')"
    />

    <div :class="['grid gap-4', 'md:grid-cols-2']">
      <label :class="['flex flex-col gap-2']">
        <span :class="['text-sm font-medium']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.source.title') }}
        </span>
        <SelectTab v-model="live2dScreenAmbientLightSource" :options="sourceOptions" size="sm" />
      </label>

      <label :class="['flex flex-col gap-2']">
        <span :class="['text-sm font-medium']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.mode.title') }}
        </span>
        <SelectTab v-model="live2dScreenAmbientLightMode" :options="modeOptions" size="sm" />
      </label>
    </div>

    <div
      v-if="live2dScreenAmbientLightSource === 'forced-color'"
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
          :style="{ backgroundColor: live2dScreenAmbientLightForcedColor }"
        />
        <ColorPicker v-model="live2dScreenAmbientLightForcedColor" :alpha="false" />
      </div>
    </div>

    <FieldRange
      v-model="live2dScreenAmbientLightStrength"
      as="div"
      :min="0"
      :max="1"
      :step="0.01"
      :default-value="live2dAmbientLightDefaults.strength"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.strength.title')"
      :description="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.strength.description')"
    />

    <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.main-window-note') }}
    </div>
  </Section>
</template>
