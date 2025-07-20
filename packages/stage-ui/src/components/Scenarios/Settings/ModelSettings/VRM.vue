<script setup lang="ts">
import { FieldRange, Input } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVRM } from '../../../../stores'
import { Callout, Section } from '../../../Layouts'
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
  scale,
  modelSize,
  modelOffset,
  cameraFOV,
  defaultModelUrl,
  selectedModel,
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
  if (!modelUrl.value && selectedModel.value === defaultModelUrl.value) {
    localModelUrl.value = defaultModelUrl.value
    return
  }
  // Only when real different URL is entered, then the loader will be triggered
  loadSource.value = 'url'
  loadingModel.value = true
  localModelUrl.value = selectedModel.value
}
</script>

<template>
  <Section
    :title="t('settings.vrm.switch-to-vrm.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Button variant="secondary" @click="$emit('switchToLive2D')">
      {{ t('settings.vrm.switch-to-vrm.change-to-vrm') }}
    </Button>
  </Section>
  <Section
    :title="t('settings.vrm.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Callout
      :label="t('settings.vrm.scale-and-position.model-info-title')"
      w-full
    >
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
      w-full
    >
      <div class="text-sm text-neutral-600 space-y-1">
        {{ t('settings.vrm.scale-and-position.tips') }}
      </div>
    </Callout>
    <FieldRange
      v-model="scale"
      as="div"
      :min="0"
      :max="5"
      :step="scale / 100"
      :label="t('settings.vrm.scale-and-position.x')"
      :format-value="val => val.toFixed(4)"
    >
      <template #label>
        <div flex items-center>
          <div>
            {{ t('settings.vrm.scale-and-position.scale') }}
          </div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => scale = 1">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange
      v-model="modelOffset.x"
      as="div"
      :min="-modelSize.x - 10"
      :max="modelSize.x + 10"
      :step="modelSize.x / 100"
      :label="t('settings.vrm.scale-and-position.x')"
      :format-value="val => val.toFixed(4)"
    >
      <template #label>
        <div flex items-center>
          <div>
            {{ t('settings.vrm.scale-and-position.x') }}
          </div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.x = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange
      v-model="modelOffset.y"
      as="div"
      :min="-modelSize.y - 10"
      :max="modelSize.y + 10"
      :step="modelSize.y / 100"
      :label="t('settings.vrm.scale-and-position.y')"
      :format-value="val => val.toFixed(4)"
    >
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.y') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.y = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange
      v-model="modelOffset.z"
      as="div"
      :min="-modelSize.z - 10"
      :max="modelSize.z + 10"
      :step="modelSize.z / 100"
      :label="t('settings.vrm.scale-and-position.z')"
      :format-value="val => val.toFixed(4)"
    >
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.z') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.z = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </Section>
  <Section
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
  </Section>
  <Section
    :title="t('settings.vrm.theme-color-from-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
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
  </Section>
  <Section
    :title="t('settings.vrm.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
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
    <FieldRange
      :model-value="Number(modelOffset.x.toFixed(4))"
      as="div"
      :min="-modelSize.x"
      :max="modelSize.x"
      :step="modelSize.x / 100"
      :label="t('settings.vrm.scale-and-position.x')"
      @update:model-value="val => modelOffset.x = val"
    >
      <template #label>
        <div flex items-center>
          <div>
            {{ t('settings.vrm.scale-and-position.x') }}
          </div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.x = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange
      :model-value="Number(modelOffset.y.toFixed(4))"
      as="div"
      :min="-modelSize.y"
      :max="modelSize.y"
      :step="modelSize.y / 100"
      :label="t('settings.vrm.scale-and-position.y')"
      @update:model-value="val => modelOffset.y = val"
    >
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.y') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.y = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange
      :model-value="Number(modelOffset.z.toFixed(4))"
      as="div"
      :min="-modelSize.z"
      :max="modelSize.z"
      :step="modelSize.z / 100"
      :label="t('settings.vrm.scale-and-position.z')"
      @update:model-value="val => modelOffset.z = val"
    >
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.z') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.z = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange
      :model-value="cameraFOV"
      as="div"
      :min="1"
      :max="180"
      :step="1"
      :label="t('settings.vrm.scale-and-position.fov')"
      @update:model-value="val => cameraFOV = val"
    >
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.fov') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => cameraFOV = 40">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </Section>
</template>
