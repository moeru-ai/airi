<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useFileDialog, useObjectUrl } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVRM } from '../../../../stores'
import { Container, PropertyNumber, PropertyPoint } from '../../../DataPane'
import { Callout } from '../../../Layouts'
import { Button } from '../../../Misc'
import { ColorPalette } from '../../../Widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
  (e: 'switchToLive2D'): void
}>()

const { t } = useI18n()

const modelFileDialog = useFileDialog({
  accept: '.vrm',
})

const vrm = useVRM()
const {
  modelFile,
  modelUrl,
  modelSize,
  modelOffset,
  cameraFOV,
  modelRotationY,
  cameraDistance,
  trackingMode,
} = storeToRefs(vrm)

const trackingOptions = computed(() => [
  { value: 'camera', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.camera'), class: 'col-start-3' },
  { value: 'mouse', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.mouse'), class: 'col-start-4' },
  { value: 'none', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.disabled'), class: 'col-start-5' },
])

modelFileDialog.onChange((files) => {
  if (files && files.length > 0) {
    modelFile.value = files[0]
  }
})

const urlFile = useObjectUrl(modelFile)
const urlRef = computed({
  get: () => urlFile.value || modelUrl.value || '',
  set: (value) => {
    modelUrl.value = value
  },
})

function handleUrlLoad() {
  const parsedUrl = new URL(urlRef.value, 'https://example.com')
  if (parsedUrl.origin === 'https://example.com') {
    modelUrl.value = urlRef.value
  }
}
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
    <Button variant="secondary" size="sm" @click="$emit('switchToLive2D')">
      {{ t('settings.vrm.switch-to-vrm.change-to-vrm') }}
    </Button>
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
      <span
        class="col-span-1 col-start-1 row-start-6 self-center text-xs leading-tight font-mono"
      >
        {{ t('settings.vrm.scale-and-position.eye-tracking-mode.title') }}:
      </span>
      <template v-for="option in trackingOptions" :key="option.value">
        <Button
          :class="[option.class, 'row-start-6 w-auto']"
          size="sm"
          :variant="trackingMode === option.value ? 'primary' : 'secondary'"
          :label="option.label"
          @click="trackingMode = option.value"
        />
      </template>
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
    <Button
      variant="secondary" @click=" () => {
        modelFileDialog.reset()
        modelFileDialog.open()
      }"
    >
      {{ t('settings.vrm.change-model.from-file') }}...
    </Button>
    <div flex items-center gap-2>
      <Input
        v-model="urlRef"
        class="flex-1"
        :placeholder="t('settings.vrm.change-model.from-url-placeholder')"
      />
      <Button size="sm" variant="secondary" @click="handleUrlLoad">
        {{ t('settings.vrm.change-model.from-url') }}
      </Button>
    </div>

    <Callout :label="t('settings.vrm.scale-and-position.model-info-title')">
      <div>
        <div class="text-sm text-neutral-600 space-y-1">
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
      <div class="text-sm text-neutral-600 space-y-1">
        {{ t('settings.vrm.scale-and-position.tips') }}
      </div>
    </Callout>
  </Container>
</template>
