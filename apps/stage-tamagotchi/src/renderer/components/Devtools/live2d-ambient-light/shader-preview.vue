<script setup lang="ts">
import type { AmbientLightEnvironment, AmbientLightFilterOptions } from '@proj-airi/stage-shared/screen-ambient-light'

import ScreenAmbientLightPreview from '@proj-airi/stage-ui-live2d/components/diagnostics/screen-ambient-light-preview.vue'

import { ambientLightNeutralEnvironment } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { ambientLightTestCard } from '@proj-airi/stage-ui-live2d/utils/ambient-light-test-card'
import { Section } from '@proj-airi/stage-ui/components'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useScreenAmbientLightDiagnostics } from '../../../composables/use-screen-ambient-light-diagnostics'

/**
 * Plate the preview canvas sits on.
 *
 * The wrap and the backlight only add light, so a mid-dark plate keeps the
 * added light visible. It stays the same in both color modes, because a plate
 * that followed the theme would change what the comparison shows.
 */
const plateColor = '#2c2c33'

const { t } = useI18n()
const { diagnostics } = useScreenAmbientLightDiagnostics()
const {
  screenAmbientLightBacklight,
  screenAmbientLightBaseBrightness,
  screenAmbientLightBaseContrast,
  screenAmbientLightChroma,
  screenAmbientLightExposureRange,
  screenAmbientLightMode,
  screenAmbientLightStrength,
  screenAmbientLightTranslucentWrap,
  screenAmbientLightWrapDiffuse,
  screenAmbientLightWrapIntensity,
} = storeToRefs(useSettingsScreenAmbientLight())

/** Message shown in place of the preview when the renderer cannot start. */
const failure = shallowRef<string>()

const filterOptions = computed<AmbientLightFilterOptions>(() => ({
  baseBrightness: screenAmbientLightBaseBrightness.value,
  exposureRange: screenAmbientLightExposureRange.value,
  baseContrast: screenAmbientLightBaseContrast.value,
  chroma: screenAmbientLightChroma.value,
  wrapIntensity: screenAmbientLightWrapIntensity.value,
  wrapDiffuse: screenAmbientLightWrapDiffuse.value,
  backlight: screenAmbientLightBacklight.value,
  translucentWrap: screenAmbientLightTranslucentWrap.value,
}))

/**
 * Environment the preview lights the card with.
 *
 * `appliedEnvironment` is what the stage renderer hands the filter after
 * temporal smoothing, so the preview reads the same maps the model reads. The
 * devtool window receives it over the diagnostics broadcast channel, which
 * carries nothing until the stage publishes its first snapshot. Until then the
 * preview uses the shared neutral environment, and the section says so.
 */
const previewEnvironment = computed<AmbientLightEnvironment>(
  () => diagnostics.value?.sampling?.appliedEnvironment ?? ambientLightNeutralEnvironment,
)
const environmentNote = computed(() => previewEnvironment.value === ambientLightNeutralEnvironment
  ? t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.environment.neutral')
  : t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.environment.live'))

// The captions name what the card shows, so they take every number from the
// card itself. The bar caption names each bar in order, so the message carries
// one placeholder per bar and keeps the list separators of its locale.
const [first, second, third, fourth, fifth] = ambientLightTestCard.bars.widths
const barWidths = { first, second, third, fourth, fifth }
const rampEnds = { low: ambientLightTestCard.ramp.low, high: ambientLightTestCard.ramp.high }
const patchAlphas = {
  strong: formatAlpha(ambientLightTestCard.patches[0].alpha),
  weak: formatAlpha(ambientLightTestCard.patches[1].alpha),
}

function formatAlpha(alpha: number) {
  return `${alpha * 100}%`
}
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.title')"
    icon="i-solar:gallery-wide-bold-duotone"
    inner-class="gap-4"
  >
    <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.description') }}
    </div>
    <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.window-mapping') }}
    </div>

    <div
      v-if="failure"
      :class="[
        'grid gap-1 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center',
        'text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400',
      ]"
    >
      <div>{{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.unavailable') }}</div>
      <div :class="['text-xs']">
        {{ failure }}
      </div>
    </div>
    <template v-else>
      <div :class="['grid gap-1']">
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.filtered') }}
        </div>
        <div
          :class="['overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800']"
          :style="{ backgroundColor: plateColor }"
        >
          <ScreenAmbientLightPreview
            :environment="previewEnvironment"
            :options="filterOptions"
            :mode="screenAmbientLightMode"
            :strength="screenAmbientLightStrength"
            @failed="message => failure = message"
          />
        </div>
      </div>

      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ environmentNote }}
      </div>

      <div :class="['grid gap-1 rounded-xl bg-neutral-100/70 p-3 dark:bg-neutral-800/70']">
        <div :class="['text-sm font-medium']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.regions.title') }}
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.regions.body', rampEnds) }}
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.regions.bars', barWidths) }}
        </div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.regions.patches', patchAlphas) }}
        </div>
      </div>
    </template>
  </Section>
</template>
