<script setup lang="ts">
import { InputFile } from '@proj-airi/ui'
import { Vibrant } from 'node-vibrant/browser'
import { ref, watch } from 'vue'

const files = ref<File[]>([])
const image = ref<HTMLImageElement>()
const colors = ref<string[]>([])
const colorsDebug = ref<string[]>([])

function handleFileChange(file: File) {
  const img = new Image()
  img.src = URL.createObjectURL(file)
  img.onload = handleImageLoad
  image.value = img
}

async function handleImageLoad() {
  if (!image.value)
    return

  const vibrant = new Vibrant(image.value)
  const palette = await vibrant.getPalette()
  colors.value = Object.values(palette).map(color => color?.hex).filter(it => typeof it === 'string')
  colorsDebug.value = Object.values(palette).map(color => JSON.stringify(color))
}

watch(files, (files) => {
  handleFileChange(files[0])
}, { deep: true })
</script>

<template>
  <div flex flex-col gap-4>
    <div

      border="2 solid neutral-200 dark:neutral-800"
      bg="neutral-50 dark:neutral-900"
      w-full flex gap-2 rounded-lg p-4
    >
      <div v-for="(color, index) in colors" :key="index" :style="{ backgroundColor: color }" size-20 rounded-full />
    </div>
    <div

      border="2 solid neutral-200 dark:neutral-800"
      bg="neutral-50 dark:neutral-900"
      w-full flex gap-2 rounded-lg p-4
    >
      {{ colorsDebug }}
    </div>
    <div flex gap-2>
      <InputFile v-model="files" h-60 w-full />
    </div>
    <div
      h-60
      border="2 solid neutral-200 dark:neutral-800"
      bg="neutral-50 dark:neutral-900"
      rounded-lg
    >
      <img v-if="image" :src="image.src" h-full w-full object-contain>
    </div>
  </div>
</template>
