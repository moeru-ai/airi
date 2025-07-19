<script setup lang="ts">
import JSZip from 'jszip'
import localforage from 'localforage'

import { Checkbox, FieldRange, Input } from '@proj-airi/ui'
import { useFileDialog, useObjectUrl } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { Emotion, EmotionNeutralMotionName } from '../../../../constants'
import { useLive2d, useSettings } from '../../../../stores'
import { Section } from '../../../Layouts'
import { Button } from '../../../Misc'
import { ColorPalette } from '../../../Widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
  (e: 'switchToVRM'): void
}>()

const { t } = useI18n()

const modelFileDialog = useFileDialog({
  accept: 'application/zip',
})

const settings = useSettings()
const { live2dDisableFocus } = storeToRefs(settings)

const live2d = useLive2d()
const {
  modelFile,
  motionMap,
  loadSource,
  loadingModel,
  availableMotions,
  modelUrl,
  currentMotion,
  scale,
  position,
} = storeToRefs(live2d)
const localModelUrl = ref(modelUrl.value)

modelFileDialog.onChange((files) => {
  if (files && files.length > 0) {
    motionMap.value = {}
    modelFile.value = files[0]
    loadSource.value = 'file'
    loadingModel.value = true
  }
})

watch(loadingModel, (value) => {
  if (value) {
    return
  }

  if (loadSource.value !== 'file') {
    return
  }

  availableMotions.value.forEach((motion) => {
    if (motion.motionName in Emotion) {
      motionMap.value[motion.fileName] = motion.motionName
    }
    else {
      motionMap.value[motion.fileName] = EmotionNeutralMotionName
    }
  })
})

async function patchMotionMap(source: File, motionMap: Record<string, string>): Promise<File> {
  if (!Object.keys(motionMap).length)
    return source

  const jsZip = new JSZip()
  const zip = await jsZip.loadAsync(source)
  const fileName = Object.keys(zip.files).find(key => key.endsWith('model3.json'))
  if (!fileName) {
    throw new Error('model3.json not found')
  }

  const model3Json = await zip.file(fileName)!.async('string')
  const model3JsonObject = JSON.parse(model3Json)

  const motions: Record<string, { File: string }[]> = {}
  Object.entries(motionMap).forEach(([key, value]) => {
    if (motions[value]) {
      motions[value].push({ File: key })
      return
    }
    motions[value] = [{ File: key }]
  })

  model3JsonObject.FileReferences.Motions = motions

  zip.file(fileName, JSON.stringify(model3JsonObject, null, 2))
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  return new File([zipBlob], source.name, {
    type: source.type,
    lastModified: source.lastModified,
  })
}

async function saveMotionMap() {
  const fileFromIndexedDB = await localforage.getItem<File>('live2dModel')
  if (!fileFromIndexedDB) {
    return
  }

  const patchedFile = await patchMotionMap(fileFromIndexedDB, motionMap.value)
  modelFile.value = patchedFile
  loadSource.value = 'file'
  loadingModel.value = true
}

const exportObjectUrl = useObjectUrl(modelFile)
</script>

<template>
  <Section
    :title="t('settings.live2d.switch-to-vrm.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Button variant="secondary" @click="$emit('switchToVRM')">
      {{ t('settings.live2d.switch-to-vrm.change-to-vrm') }}
    </Button>
  </Section>
  <Section
    :title="t('settings.live2d.change-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Button variant="secondary" @click="modelFileDialog.open()">
      {{ t('settings.live2d.change-model.from-file') }}...
    </Button>
    <div flex items-center gap-2>
      <Input
        v-model="localModelUrl"
        :disabled="loadingModel"
        class="flex-1"
        :placeholder="t('settings.live2d.change-model.from-url-placeholder')"
      />
      <Button size="sm" variant="secondary" @click="modelUrl = localModelUrl">
        {{ t('settings.live2d.change-model.from-url') }}
      </Button>
    </div>
  </Section>
  <Section
    :title="t('settings.live2d.theme-color-from-model.title')"
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
      {{ t('settings.live2d.theme-color-from-model.button-extract.title') }}
    </Button>
  </Section>
  <Section
    v-if="loadSource === 'file'"
    :title="t('settings.live2d.edit-motion-map.title')"
    icon="i-solar:face-scan-circle-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <div v-for="motion in availableMotions" :key="motion.fileName" flex items-center justify-between text-sm>
      <span font-medium font-mono>{{ motion.fileName }}</span>

      <div flex gap-2>
        <select v-model="motionMap[motion.fileName]">
          <option v-for="emotion in Object.keys(Emotion)" :key="emotion">
            {{ emotion }}
          </option>
        </select>

        <Button
          class="form-control"
          @click="currentMotion = { group: motion.motionName, index: motion.motionIndex }"
        >
          Play
        </Button>
      </div>
    </div>
    <Button @click="saveMotionMap">
      Save and patch
    </Button>
    <a
      mt-2 block :href="exportObjectUrl"
      :download="`${modelFile?.name || 'live2d'}-motion-edited.zip`"
    >
      <Button w-full>Export</button>
    </a>
  </Section>
  <Section
    :title="t('settings.live2d.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <FieldRange v-model="scale" as="div" :min="0.5" :max="2" :step="0.01" :label="t('settings.live2d.scale-and-position.scale')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.scale') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => scale = 1">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="position.x" as="div" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.x')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.x') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => position.x = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="position.y" as="div" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.y')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.y') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => position.y = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </Section>
  <Section
    :title="t('settings.live2d.focus.title')"
    icon="i-solar:eye-scan-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Checkbox
      v-model="live2dDisableFocus"
      :label="t('settings.live2d.focus.disable-focus')"
    />
  </Section>
</template>
