<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVRM } from '../../../../stores'
import { Section } from '../../../Layouts'
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
} = storeToRefs(vrm)
const localModelUrl = ref(modelUrl.value)

modelFileDialog.onChange((files) => {
  if (files && files.length > 0) {
    modelFile.value = files[0]
    loadSource.value = 'file'
    loadingModel.value = true
  }
})
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
    :title="t('settings.vrm.change-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Button variant="secondary" @click="modelFileDialog.open()">
      {{ t('settings.vrm.change-model.from-file') }}...
    </Button>
    <div flex items-center gap-2>
      <Input
        v-model="localModelUrl"
        :disabled="loadingModel"
        class="flex-1"
        :placeholder="t('settings.vrm.change-model.from-url-placeholder')"
      />
      <Button size="sm" variant="secondary" @click="() => { modelUrl = localModelUrl; loadSource = 'url'; loadingModel = true }">
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
  <!-- <Section
    :title="t('settings.vrm.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <FieldRange v-model="scale" as="div" :min="0.5" :max="2" :step="0.01" :label="t('settings.vrm.scale-and-position.scale')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.scale') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => scale = 1">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelOffset.x" as="div" :min="-2*modelSize.x" :max="2*modelSize.x" :step="1" :label="t('settings.vrm.scale-and-position.x')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.x') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.x = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelOffset.y" as="div" :min="-2*modelSize.y" :max="2*modelSize.y" :step="1" :label="t('settings.vrm.scale-and-position.y')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.y') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.y = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelOffset.z" as="div" :min="-2*modelSize.z" :max="2*modelSize.z" :step="1" :label="t('settings.vrm.scale-and-position.z')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.vrm.scale-and-position.z') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelOffset.z = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </Section> -->
</template>
