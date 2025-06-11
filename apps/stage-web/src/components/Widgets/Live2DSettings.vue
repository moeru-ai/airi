<script setup lang="ts">
import { Section } from '@proj-airi/stage-ui/components'
import { Emotion, EmotionNeutralMotionName } from '@proj-airi/stage-ui/constants'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useFileDialog, useObjectUrl } from '@vueuse/core'
import JSZip from 'jszip'
import localforage from 'localforage'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ColorPalette from '../Settings/ColorPalette.vue'
import Button from '../Settings/Live2DModelControlButton.vue'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const modelFile = useFileDialog({
  accept: 'application/zip',
})

const settings = useSettings()
const { live2dModelFile, live2dMotionMap, live2dLoadSource, loadingLive2dModel, availableLive2dMotions, live2dModelUrl } = storeToRefs(settings)
const localModelUrl = ref(live2dModelUrl.value)

modelFile.onChange((files) => {
  if (files && files.length > 0) {
    live2dMotionMap.value = {}
    live2dModelFile.value = files[0]
    live2dLoadSource.value = 'file'
    loadingLive2dModel.value = true
  }
})

watch(() => settings.loadingLive2dModel, (value) => {
  if (value) {
    return
  }

  if (live2dLoadSource.value !== 'file') {
    return
  }

  availableLive2dMotions.value.forEach((motion) => {
    if (motion.motionName in Emotion) {
      live2dMotionMap.value[motion.fileName] = motion.motionName
    }
    else {
      live2dMotionMap.value[motion.fileName] = EmotionNeutralMotionName
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

  const patchedFile = await patchMotionMap(fileFromIndexedDB, live2dMotionMap.value)
  live2dModelFile.value = patchedFile
  live2dLoadSource.value = 'file'
  loadingLive2dModel.value = true
}

const exportObjectUrl = useObjectUrl(live2dModelFile)
</script>

<template>
  <div flex="~ col gap-4">
    <Section :title="t('settings.live2d.change-model.title')" icon="i-solar:magic-stick-3-bold-duotone" inner-class="text-sm">
      <div flex items-center gap-2>
        <input
          v-model="localModelUrl"
          :disabled="settings.loadingLive2dModel"
          class="form-control flex-1"
          border="neutral-300 dark:neutral-800 solid 1 focus:neutral-400 dark:focus:neutral-600"
          transition="border duration-250 ease-in-out"
          :placeholder="t('settings.live2d.change-model.from-url-placeholder')"
        >
        <Button class="form-control" @click="live2dModelUrl = localModelUrl">
          {{ t('settings.live2d.change-model.from-url') }}
        </Button>
      </div>
      <Button class="form-control place-self-end" @click="modelFile.open()">
        {{ t('settings.live2d.change-model.from-file') }}...
      </Button>
      <Button class="form-control" @click="$emit('extractColorsFromModel')">
        Extract colors from model
      </Button>
      <ColorPalette :colors="palette.map(hex => ({ hex, name: hex }))" />
    </Section>
    <Section
      v-if="settings.live2dLoadSource === 'file'"
      title="settings.live2d.edit-motion-map.title"
      icon="i-solar:face-scan-circle-bold-duotone"
    >
      <div v-for="motion in settings.availableLive2dMotions" :key="motion.fileName" flex items-center justify-between text-sm>
        <span font-medium>{{ motion.fileName }}</span>

        <div flex gap-2>
          <select v-model="settings.live2dMotionMap[motion.fileName]">
            <option v-for="emotion in Object.keys(Emotion)" :key="emotion">
              {{ emotion }}
            </option>
          </select>

          <Button
            class="form-control"
            @click="settings.live2dCurrentMotion = { group: motion.motionName, index: motion.motionIndex }"
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
        :download="`${settings.live2dModelFile?.name || 'live2d'}-motion-edited.zip`"
      >
        <Button w-full>Export</button>
      </a>
    </Section>
  </div>
</template>

<style scoped>
.form-control {
  --at-apply: rounded px-2 py-1 outline-none;
}
</style>
