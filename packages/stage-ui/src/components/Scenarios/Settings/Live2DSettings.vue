<script setup lang="ts">
import JSZip from 'jszip'
import localforage from 'localforage'

import { Emotion, EmotionNeutralMotionName } from '@proj-airi/stage-ui/constants'
import { useLive2d } from '@proj-airi/stage-ui/stores'
import { FieldRange } from '@proj-airi/ui'
import { useFileDialog, useObjectUrl } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Section from '../../Layouts/Section.vue'
import Button from '../../Misc/Button.vue'

import { ColorPalette } from '../../Widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const modelFileDialog = useFileDialog({
  accept: 'application/zip',
})

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
  <div flex="~ col gap-2">
    <Section :title="t('settings.live2d.change-model.title')" icon="i-solar:magic-stick-3-bold-duotone" inner-class="text-sm">
      <div flex items-center gap-2>
        <input
          v-model="localModelUrl"
          :disabled="loadingModel"
          class="form-control flex-1"
          border="neutral-300 dark:neutral-800 solid 1 focus:neutral-400 dark:focus:neutral-600"
          transition="border duration-250 ease-in-out"
          :placeholder="t('settings.live2d.change-model.from-url-placeholder')"
        >
        <Button class="form-control" size="sm" @click="modelUrl = localModelUrl">
          {{ t('settings.live2d.change-model.from-url') }}
        </Button>
      </div>
      <Button class="form-control place-self-end" size="sm" @click="modelFileDialog.open()">
        {{ t('settings.live2d.change-model.from-file') }}...
      </Button>
      <Button class="form-control" size="sm" @click="$emit('extractColorsFromModel')">
        Extract colors from model
      </Button>
      <ColorPalette :colors="palette.map(hex => ({ hex, name: hex }))" />
    </Section>
    <Section
      v-if="loadSource === 'file'"
      :title="t('settings.live2d.edit-motion-map.title')"
      icon="i-solar:face-scan-circle-bold-duotone"
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
            size="sm"
            class="form-control"
            @click="currentMotion = { group: motion.motionName, index: motion.motionIndex }"
          >
            Play
          </Button>
        </div>
      </div>
      <Button size="sm" @click="saveMotionMap">
        Save and patch
      </Button>
      <a
        mt-2 block :href="exportObjectUrl"
        :download="`${modelFile?.name || 'live2d'}-motion-edited.zip`"
      >
        <Button w-full size="sm">Export</button>
      </a>
    </Section>
    <Section :title="t('settings.live2d.scale-and-position.title')" icon="i-solar:scale-bold-duotone">
      <FieldRange v-model="scale" :min="0.5" :max="2" :step="0.01" :label="t('settings.live2d.scale-and-position.scale')" />
      <FieldRange v-model="position.x" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.x')" />
      <FieldRange v-model="position.y" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.y')" />
    </Section>
  </div>
</template>

<style scoped>
.form-control {
  --at-apply: rounded px-2 py-1 outline-none;
}
</style>
