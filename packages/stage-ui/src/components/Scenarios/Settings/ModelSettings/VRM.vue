<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
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
  loadSource,
  loadingModel,
  modelUrl,
  modelSize,
  modelOffset,
  cameraFOV,
  selectedModel,
  modelRotationY,
  cameraDistance,
  trackingMode,
} = storeToRefs(vrm)
const localModelUrl = ref(modelUrl.value)

modelFileDialog.onChange((files) => {
  if (files && files.length > 0) {
    modelFile.value = files[0]
    loadSource.value = 'file'
    loadingModel.value = true
    localModelUrl.value = ''
  }
})

function urlUploadClick() {
  modelUrl.value = localModelUrl.value
  // same URL will let the loader be lazy and forgot to reset loading state
  // If the loading state is still true, then the URL input will be locked
  if (modelUrl.value === selectedModel.value) {
    console.warn('Model URL is the same as the selected model, no need to reload.')
    return
  }
  // Can't let the default model URL be reentered into the loader, otherwise it will still be too lazy to reset the loading state
  if (!modelUrl.value && selectedModel.value === vrm.defaultModelUrl) {
    localModelUrl.value = vrm.defaultModelUrl
    return
  }
  // Only when real different URL is entered, then the loader will be triggered
  loadSource.value = 'url'
  loadingModel.value = true
  localModelUrl.value = selectedModel.value
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

      <!-- 新开一行 flex，不受上面 grid 影响 -->
      <span
        class="col-span-1 col-start-1 row-start-6 self-center text-xs leading-tight font-mono"
      >
        {{ t('settings.vrm.scale-and-position.eye-tracking-mode') }}:
      </span>
      <!-- 第二行：Camera 按钮位于第 3 列 -->
      <Button
        class="col-start-3 row-start-6 w-auto"
        size="sm"
        :variant="trackingMode === 'camera' ? 'primary' : 'secondary'"
        label="Camera"
        @click="trackingMode = 'camera'"
      />
      <!-- 第二行：Mouse 按钮位于第 4 列 -->
      <Button
        class="col-start-4 row-start-6 w-auto"
        size="sm"
        :variant="trackingMode === 'mouse' ? 'primary' : 'secondary'"
        label="Mouse"
        @click="trackingMode = 'mouse'"
      />
      <!-- 第二行：Disabled 按钮位于第 5 列 -->
      <Button
        class="col-start-5 row-start-6 w-auto"
        size="sm"
        :variant="trackingMode === 'none' ? 'primary' : 'secondary'"
        label="Disabled"
        @click="trackingMode = 'none'"
      />
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
        v-model="localModelUrl"
        :disabled="loadingModel"
        class="flex-1"
        :placeholder="t('settings.vrm.change-model.from-url-placeholder')"
      />
      <Button size="sm" variant="secondary" @click="urlUploadClick">
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
