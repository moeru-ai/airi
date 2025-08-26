<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVRM } from '../../../../stores/vrm'
import { Container, PropertyColor, PropertyNumber, PropertyPoint } from '../../../DataPane'
import { Callout, Tabs } from '../../../Layouts'
import { Button } from '../../../Misc'
import { ColorPalette } from '../../../Widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const vrm = useVRM()
const {
  modelSize,
  modelOffset,
  cameraFOV,
  modelRotationY,
  cameraDistance,
  trackingMode,

  directionalLightPosition,
  directionalLightTarget,
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
  specularMix,
} = storeToRefs(vrm)
const trackingOptions = computed(() => [
  { value: 'camera', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.camera'), class: 'col-start-3' },
  { value: 'mouse', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.mouse'), class: 'col-start-4' },
  { value: 'none', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.disabled'), class: 'col-start-5' },
])

// switch between hemisphere light and sky box
const tabList = [
  {
    value: 'hemisphere',
    label: 'Hemisphere',
    icon: {
      idle: 'i-solar:forbidden-circle-linear rotate-45',
      active: 'i-solar:forbidden-circle-bold rotate-45',
    },
  },
  {
    value: 'skyBox',
    label: 'SkyBox',
    icon: {
      idle: 'i-solar:gallery-circle-linear',
      active: 'i-solar:gallery-circle-bold',
    },
  },
]
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
        :x-config="{ min: -modelSize.x * 2, max: modelSize.x * 2, step: modelSize.x / 100, label: 'X', formatValue: val => val?.toFixed(4) }"
        :y-config="{ min: -modelSize.y * 2, max: modelSize.y * 2, step: modelSize.y / 100, label: 'Y', formatValue: val => val?.toFixed(4) }"
        :z-config="{ min: -modelSize.z * 2, max: modelSize.z * 2, step: modelSize.z / 100, label: 'Z', formatValue: val => val?.toFixed(4) }"
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

      <PropertyPoint
        v-model:x="directionalLightPosition.x"
        v-model:y="directionalLightPosition.y"
        v-model:z="directionalLightPosition.z"
        label="Directional Light Position"
        :x-config="{ step: 0.001, label: 'X', formatValue: val => val?.toFixed(4) }"
        :y-config="{ step: 0.001, label: 'Y', formatValue: val => val?.toFixed(4) }"
        :z-config="{ step: 0.001, label: 'Z', formatValue: val => val?.toFixed(4) }"
      />
      <PropertyPoint
        v-model:x="directionalLightTarget.x"
        v-model:y="directionalLightTarget.y"
        v-model:z="directionalLightTarget.z"
        label="Directional Light Target"
        :x-config="{ step: 0.001, label: 'X', formatValue: val => val?.toFixed(4) }"
        :y-config="{ step: 0.001, label: 'Y', formatValue: val => val?.toFixed(4) }"
        :z-config="{ step: 0.001, label: 'Z', formatValue: val => val?.toFixed(4) }"
      />
      <PropertyPoint
        v-model:x="directionalLightRotation.x"
        v-model:y="directionalLightRotation.y"
        v-model:z="directionalLightRotation.z"
        label="Directional Light Rotation"
        :x-config="{ step: 0.001, label: 'X', formatValue: val => val?.toFixed(4) }"
        :y-config="{ step: 0.001, label: 'Y', formatValue: val => val?.toFixed(4) }"
        :z-config="{ step: 0.001, label: 'Z', formatValue: val => val?.toFixed(4) }"
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
      <Tabs v-model="envSelect" :tabs="tabList" label="Environment">
        <template #default>
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
              <PropertyNumber
                v-model="specularMix"
                :config="{ min: 0, max: 1, step: 0.01, label: 'Mix' }"
                :label="t('settings.vrm.skybox.skybox-specular-mix')"
              />
            </div>
          </div>
        </template>
      </Tabs>
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
