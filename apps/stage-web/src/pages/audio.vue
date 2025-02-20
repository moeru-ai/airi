<script setup lang="ts">
import { ref } from 'vue'

const containerRef = ref<HTMLDivElement>()
const fileInputRef = ref<HTMLInputElement>()

function handleFileUpload(e: Event) {
  if (!e)
    return

  const file = fileInputRef.value?.files?.[0]
  if (!file)
    return

  const audioElem = document.createElement('audio')
  containerRef.value?.appendChild(audioElem)

  audioElem.src = URL.createObjectURL(file)
  audioElem.controls = true
  audioElem.load()
  audioElem.play()
}
</script>

<template>
  <div>
    <div>
      <div ref="containerRef" />
      <input
        ref="fileInputRef"
        type="file"
        @change="handleFileUpload"
      >
    </div>
  </div>
</template>
