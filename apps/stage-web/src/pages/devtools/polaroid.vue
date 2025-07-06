<script setup lang="ts">
import { Screen } from '@proj-airi/stage-ui/components'
import { Live2DCanvas, Live2DModel } from '@proj-airi/stage-ui/components/scenes'
import { ref, watch } from 'vue'

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const live2dModelRef = ref<InstanceType<typeof Live2DModel>>()

const motion = ref<string>('idle')
const motionGroupsList = ref<{
  motionName: string
  motionIndex: number
  fileName: string
}[]>([])

function download(href: string, name: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function handleSetMotion(motionName: string) {
  live2dModelRef.value?.setMotion(motionName)
}

watch(live2dModelRef, (model) => {
  motionGroupsList.value = model?.listMotionGroups() || []
}, { immediate: true })

function handleModelLoaded() {
  if (live2dModelRef.value) {
    live2dModelRef.value?.setMotion(motion.value)
    motionGroupsList.value = live2dModelRef.value.listMotionGroups()
  }
}

function handleShot() {
  if (!live2dCanvasRef.value || !live2dModelRef.value)
    return

  const canvas = live2dCanvasRef.value.canvasElement()
  const dataUrl = canvas!.toDataURL('image/png')
  download(dataUrl, 'live2d-screenshot.png')
}
</script>

<template>
  <div flex flex-col items-center gap-4>
    <div h-full w-full>
      <Screen v-slot="{ width, height }" relative min-h-70dvh>
        <Live2DCanvas
          ref="live2dCanvasRef"
          v-slot="{ app }"
          :width="width"
          :height="height"
          :resolution="3"
          rounded-full
        >
          <Live2DModel
            ref="live2dModelRef"
            :app="app"
            :width="width"
            :height="height"
            :focus-at="{ x: width / 2, y: height / 2 }"
            @model-loaded="handleModelLoaded"
          />
        </Live2DCanvas>
      </Screen>
    </div>
    <div>
      <select v-model="motion" rounded-lg px-3 py-2 @change="handleSetMotion(motion)">
        <option v-for="motionItem in motionGroupsList" :key="motionItem.motionIndex" :value="motionItem.motionName">
          {{ motionItem.fileName }}
        </option>
      </select>
    </div>
    <div border="2px solid white" flex items-center justify-center rounded-full p-1>
      <button
        h-18 w-18 rounded-full bg="white active:gray-50" outline-none
        transition-colors duration-200 ease-in-out
        @click="handleShot"
      />
    </div>
  </div>
</template>
