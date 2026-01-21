<script setup lang="ts">
import { useModelStore } from '@proj-airi/stage-ui-three'
import { Button, Callout, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { Container, PropertyColor, PropertyNumber, PropertyPoint } from '../../../data-pane'
import { ColorPalette } from '../../../widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const modelStore = useModelStore()
const {
  modelSize,
  modelOffset,
  cameraFOV,
  modelRotationY,
  cameraDistance,
  trackingMode,

  directionalLightRotation,
  directionalLightIntensity,
  directionalLightColor,

  ambientLightIntensity,
  ambientLightColor,

  hemisphereLightIntensity,
  hemisphereSkyColor,
  hemisphereGroundColor,

  envSelect,
  skyBoxIntensity,
} = storeToRefs(modelStore)
const trackingOptions = computed(() => [
  { value: 'camera', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.camera'), class: 'col-start-3' },
  { value: 'mouse', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.mouse'), class: 'col-start-4' },
  { value: 'none', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.disabled'), class: 'col-start-5' },
])

// switch between hemisphere light and sky box
const envOptions = computed(() => [
  {
    value: 'hemisphere',
    label: 'Hemisphere',
    icon: envSelect.value === 'hemisphere'
      ? 'i-solar:forbidden-circle-bold rotate-45'
      : 'i-solar:forbidden-circle-linear rotate-45',
  },
  {
    value: 'skyBox',
    label: 'SkyBox',
    icon: envSelect.value === 'skyBox'
      ? 'i-solar:gallery-circle-bold'
      : 'i-solar:gallery-circle-linear',
  },
])
</script>

<template>
  <Container
    :title="t('settings.pages.models.sections.section.scene')"
    icon="i-solar:people-nearby-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
    <Button variant="secondary" @click="$emit('extractColorsFromModel')">
      {{ t('settings.vrm.theme-color-from-model.button-extract.title') }}
    </Button>

    <div grid="~ cols-5 gap-1" p-2>
      <PropertyPoint
        v-model:x="modelOffset.x"
        v-model:y="modelOffset.y"
        v-model:z="modelOffset.z"
        label="Model Position"
        :x-config="{ min: -modelSize.x * 2, max: modelSize.x * 2, step: modelSize.x / 10000, label: 'X', formatValue: val => val?.toFixed(4) }"
        :y-config="{ min: -modelSize.y * 2, max: modelSize.y * 2, step: modelSize.y / 10000, label: 'Y', formatValue: val => val?.toFixed(4) }"
        :z-config="{ min: -modelSize.z * 2, max: modelSize.z * 2, step: modelSize.z / 10000, label: 'Z', formatValue: val => val?.toFixed(4) }"
      />
      <PropertyNumber
        v-model="cameraFOV"
        :config="{ min: 1, max: 180, step: 1, label: t('settings.vrm.scale-and-position.fov') }"
        :label="t('settings.vrm.scale-and-position.fov')"
      />
      <PropertyNumber
        v-model="cameraDistance"
        :config="{ min: modelSize.z, max: modelSize.z * 20, step: modelSize.z / 100, label: t('settings.vrm.scale-and-position.camera-distance'), formatValue: val => val?.toFixed(4) }"
        :label="t('settings.vrm.scale-and-position.camera-distance')"
      />
      <PropertyNumber
        v-model="modelRotationY"
        :config="{ min: -180, max: 180, step: 1, label: t('settings.vrm.scale-and-position.rotation-y') }"
        :label="t('settings.vrm.scale-and-position.rotation-y')"
      />

      <!-- Set eye tracking mode -->
      <div class="text-xs">
        {{ t('settings.vrm.scale-and-position.eye-tracking-mode.title') }}:
      </div>
      <div />
      <template v-for="option in trackingOptions" :key="option.value">
        <Button
          :class="[option.class, 'w-auto']"
          size="sm"
          :variant="trackingMode === option.value ? 'primary' : 'secondary'"
          :label="option.label"
          @click="trackingMode = option.value"
        />
      </template>

      <PropertyNumber
        v-model="directionalLightRotation.x"
        :config="{ min: -180, max: 180, step: 1, label: 'RotationXDeg', formatValue: val => val?.toFixed(0) }"
        label="Directional Light Rotation - X"
      />
      <PropertyNumber
        v-model="directionalLightRotation.y"
        :config="{ min: -180, max: 180, step: 1, label: 'RotationYDeg', formatValue: val => val?.toFixed(0) }"
        label="Directional Light Rotation - Y"
      />
      <PropertyColor
        v-model="directionalLightColor"
        label="Directional Light Color"
      />

      <PropertyNumber
        v-model="directionalLightIntensity"
        :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity' }"
        label="Directional Light Intensity"
      />

      <PropertyNumber
        v-model="ambientLightIntensity"
        :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity' }"
        label="Ambient Light Intensity"
      />
      <PropertyColor
        v-model="ambientLightColor"
        label="Ambient Light Color"
      />
    </div>
    <div>
      <div
        :class="[
          'px-2',
          'pt-2',
          'text-xs',
          'text-neutral-500',
          'dark:text-neutral-400',
        ]"
      >
        Environment
      </div>
      <div :class="['p-2']">
        <SelectTab v-model="envSelect" :options="envOptions" size="sm" />
      </div>
      <div v-if="envSelect === 'hemisphere'">
        <!-- hemisphere settings -->
        <div grid="~ cols-5 gap-1" p-2>
          <PropertyNumber
            v-model="hemisphereLightIntensity"
            :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity' }"
            label="Hemisphere Light Intensity"
          />
          <PropertyColor
            v-model="hemisphereSkyColor"
            label="Hemisphere Sky Color"
          />
          <PropertyColor
            v-model="hemisphereGroundColor"
            label="Hemisphere Ground Color"
          />
        </div>
      </div>
      <div v-else>
        <!-- skybox settings -->
        <div grid="~ cols-5 gap-1" p-2>
          <PropertyNumber
            v-model="skyBoxIntensity"
            :config="{ min: 0, max: 1, step: 0.01, label: 'Intensity' }"
            :label="t('settings.vrm.skybox.skybox-intensity')"
          />
        </div>
      </div>
    </div>
  </Container>
  <Container
    :title="t('settings.vrm.change-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Callout :label="t('settings.vrm.scale-and-position.model-info-title')">
      <div>
        <div class="text-sm text-neutral-600 space-y-1 dark:text-neutral-400">
          <div class="flex justify-between">
            <span>{{ t('settings.vrm.scale-and-position.model-info-x') }}</span>
            <span>{{ modelSize.x.toFixed(4) }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('settings.vrm.scale-and-position.model-info-y') }}</span>
            <span>{{ modelSize.y.toFixed(4) }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('settings.vrm.scale-and-position.model-info-z') }}</span>
            <span>{{ modelSize.z.toFixed(4) }}</span>
          </div>
        </div>
      </div>
    </Callout>
    <Callout
      theme="lime"
      label="Tips!"
    >
      <div class="text-sm text-neutral-600 space-y-1 dark:text-neutral-400">
        {{ t('settings.vrm.scale-and-position.tips') }}
      </div>
    </Callout>
  </Container>
</template>
