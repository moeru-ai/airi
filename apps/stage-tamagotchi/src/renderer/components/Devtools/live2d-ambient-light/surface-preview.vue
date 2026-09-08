<script setup lang="ts">
import type { SurfaceLightPreviewOptions, SurfaceLightPreviewShape } from '@proj-airi/stage-ui-live2d/filters/surface-light-preview'
import type { SelectTabOption } from '@proj-airi/ui'

import SurfaceLightPreview from '@proj-airi/stage-ui-live2d/components/diagnostics/surface-light-preview.vue'

import { ambientLightNeutralEnvironment } from '@proj-airi/stage-shared/screen-ambient-light'
import { useSettingsScreenAmbientLight } from '@proj-airi/stage-shared/stores/screen-ambient-light'
import { Section } from '@proj-airi/stage-ui/components'
import { FieldCheckbox, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useScreenAmbientLightDiagnostics } from '../../../composables/use-screen-ambient-light-diagnostics'

const { t } = useI18n()
const { diagnostics } = useScreenAmbientLightDiagnostics()
const settings = storeToRefs(useSettingsScreenAmbientLight())
const shape = shallowRef<SurfaceLightPreviewShape>('cylinder')
const normals = shallowRef(false)
const failure = shallowRef<string>()
const choices = computed<SelectTabOption<SurfaceLightPreviewShape>[]>(() => [
  { value: 'cylinder', label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.surface-preview.cylinder') },
  { value: 'sphere', label: t('tamagotchi.settings.devtools.pages.live2d-ambient-light.surface-preview.sphere') },
])
const options = computed<SurfaceLightPreviewOptions>(() => {
  const bounds = diagnostics.value?.windowBounds
  return {
    environment: diagnostics.value?.sampling?.appliedEnvironment ?? ambientLightNeutralEnvironment,
    material: { faceYaw: settings.screenAmbientLightFaceYaw.value, faceShadow: settings.screenAmbientLightFaceShadow.value, roughness: settings.screenAmbientLightRoughness.value, skinRelief: settings.screenAmbientLightSkinRelief.value, illustrated: settings.screenAmbientLightIllustrated.value, sheen: settings.screenAmbientLightSheen.value, nose: settings.screenAmbientLightNose.value, softHighlights: settings.screenAmbientLightSoftHighlights.value },
    geometry: { bend: settings.screenAmbientLightBend.value, gap: settings.screenAmbientLightGap.value, flatRadius: settings.screenAmbientLightFlatRadius.value },
    mode: settings.screenAmbientLightMode.value,
    strength: settings.screenAmbientLightStrength.value,
    chroma: settings.screenAmbientLightChroma.value,
    // Until the stage publishes its bounds, show a square neutral preview.
    aspect: bounds ? bounds.width / bounds.height : 1,
    shape: shape.value,
    normals: normals.value,
  }
})
</script>

<template>
  <Section
    :title="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.surface-preview.title')"
    icon="i-solar:lightbulb-bolt-bold-duotone"
    inner-class="gap-4"
  >
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.surface-preview.description') }}
    </p>
    <SelectTab v-model="shape" :options="choices" size="sm" />
    <FieldCheckbox
      v-model="normals"
      :label="t('tamagotchi.settings.devtools.pages.live2d-ambient-light.surface-preview.normals')"
    />
    <div v-if="failure" role="alert">
      {{ failure }}
    </div>
    <div v-else :class="['rounded-xl bg-[#202532] p-3']">
      <SurfaceLightPreview :options="options" @failed="message => failure = message" />
    </div>
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.surface-preview.mapping') }}
    </p>
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t(`tamagotchi.settings.devtools.pages.live2d-ambient-light.preview-shader.environment.${diagnostics?.sampling?.appliedEnvironment ? 'live' : 'neutral'}`) }}
    </p>
  </Section>
</template>
