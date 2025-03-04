<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { Emotion } from '@proj-airi/stage-ui/constants'
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useFileDialog } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const modelFile = useFileDialog({
  accept: 'application/zip',
})

const settings = useSettings()
const modelUrl = ref(settings.live2dModel)

const motionFileMap = computed(() => { // reverse the motion map
  const map: Record<string, Emotion> = {} // { fileName: Emotion }
  for (const [emotion, motions] of Object.entries(settings.live2dMotionMap)) {
    motions.forEach((motion) => {
      map[motion] = emotion as Emotion
    })
  }

  // motion not in the map should be neutral
  settings.availableLive2dMotions.forEach((motion) => {
    if (!map[motion.fileName]) {
      map[motion.fileName] = Emotion.Neutral
    }
  })

  return map
})

modelFile.onChange((files) => {
  if (files && files.length > 0) {
    settings.live2dModel = files[0]
  }
})

function handleMotionChange(e: Event, fileName: string) {
  const emotion = (e.target as HTMLSelectElement).value as Emotion
  // remove the file name from the map
  Object.entries(settings.live2dMotionMap).forEach(([emotion, motions]) => {
    if (motions.includes(fileName)) {
      settings.live2dMotionMap[emotion as Emotion] = motions.filter(motion => motion !== fileName)
    }
  })

  settings.live2dMotionMap[emotion].push(fileName)
}
</script>

<template>
  <Collapsable w-full>
    <template #trigger="slotProps">
      <button
        bg="zinc-100 dark:zinc-800"
        hover="bg-zinc-200 dark:bg-zinc-700"
        transition="all ease-in-out duration-250"
        w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
        class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex="~ row 1" items-center gap-1.5>
          <div
            i-solar:magic-stick-3-bold-duotone class="provider-icon size-6"
            transition="filter duration-250 ease-in-out"
          />
          <div>
            {{ t('settings.live2d.change-model.title') }}
          </div>
        </div>
        <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
          <div i-solar:alt-arrow-down-bold-duotone />
        </div>
      </button>
    </template>
    <div p-4>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-1 text-sm font-medium">
              {{ t('settings.live2d.change-model.from-url') }}
            </div>
          </div>
          <div>
            <input
              v-model="modelUrl"
              :disabled="settings.loadingLive2dModel"
              type="text"
              rounded
              border="zinc-300 dark:zinc-800 solid 1 focus:zinc-400 dark:focus:zinc-600"
              transition="border duration-250 ease-in-out"
              px-2 py-1 text-sm outline-none
              :placeholder="t('settings.live2d.change-model.from-url-placeholder')"
            >
            <button
              :disabled="settings.loadingLive2dModel"
              bg="zinc-100 dark:zinc-800"
              hover="bg-zinc-200 dark:bg-zinc-700"
              transition="all ease-in-out duration-250"
              ml-2 rounded px-2 py-1 text-sm outline-none
              @click="settings.live2dModel = modelUrl"
            >
              {{ t('settings.live2d.change-model.from-url-confirm') }}
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-1 text-sm font-medium">
              {{ t('settings.live2d.change-model.from-file') }}
            </div>
          </div>
          <button
            :disabled="settings.loadingLive2dModel"
            rounded
            bg="zinc-100 dark:zinc-800"
            hover="bg-zinc-200 dark:bg-zinc-700"
            transition="all ease-in-out duration-250"
            px-2 py-1 text-sm outline-none
            @click="modelFile.open()"
          >
            {{ t('settings.live2d.change-model.from-file-select') }}
          </button>
        </div>
      </div>
    </div>
  </Collapsable>
  <Collapsable mt-4 w-full>
    <template #trigger="slotProps">
      <button
        bg="zinc-100 dark:zinc-800"
        hover="bg-zinc-200 dark:bg-zinc-700"
        transition="all ease-in-out duration-250"
        w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
        class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex="~ row 1" items-center gap-1.5>
          <div
            i-solar:magic-stick-3-bold-duotone class="provider-icon size-6"
            transition="filter duration-250 ease-in-out"
          />
          <div>
            Edit motion map
          </div>
        </div>
        <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
          <div i-solar:alt-arrow-down-bold-duotone />
        </div>
      </button>
    </template>
    <div p-4>
      <div class="space-y-4">
        <div v-for="motion in settings.availableLive2dMotions" :key="motion.fileName" class="flex items-center justify-between">
          <div class="flex items-center gap-1 text-sm font-medium">
            {{ motion.fileName }}
          </div>

          <select :value="motionFileMap[motion.fileName]" @change="handleMotionChange($event, motion.fileName)">
            <option v-for="emotion in Object.values(Emotion)" :key="emotion">
              {{ emotion }}
            </option>
          </select>

          <button
            :disabled="settings.loadingLive2dModel"
            rounded
            bg="zinc-100 dark:zinc-800"
            hover="bg-zinc-200 dark:bg-zinc-700"
            transition="all ease-in-out duration-250"
            px-2 py-1 text-sm outline-none
            @click="settings.live2dCurrentMotion = { group: motion.motionName, index: motion.motionIndex }"
          >
            Play
          </button>
        </div>
      </div>
    </div>
  </Collapsable>
</template>
