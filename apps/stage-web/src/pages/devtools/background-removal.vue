<script setup lang="ts">
import type { PreTrainedModel, Processor } from '@huggingface/transformers'

import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers'
import { InputFile } from '@proj-airi/ui'
import { check } from 'gpuu/webgpu'
import { computed, onMounted, ref } from 'vue'

const model = ref<PreTrainedModel>()
const processor = ref<Processor>()
const error = ref<unknown>()
const loading = ref()
const processing = ref(false)
const progressPercent = ref(0)
const processedImages = ref<Array<string>>()
const downloadReady = ref<boolean>()
const imageFiles = ref<File[]>([])
const imageFilesURLs = computed(() => imageFiles.value.map(img => URL.createObjectURL(img)))

onMounted(async () => {
  try {
    if (!((await check()).supported)) {
      throw new Error('WebGPU is not supported in this browser.')
    }

    const model_id = 'Xenova/modnet'
    env.backends.onnx.wasm!.proxy = false
    model.value ??= await AutoModel.from_pretrained(model_id, {
      device: 'webgpu',
    })

    processor.value ??= await AutoProcessor.from_pretrained(model_id, {})
  }
  catch (err) {
    error.value = err
  }

  loading.value = false
})

async function processImages() {
  if (!model.value)
    return
  if (!processor.value)
    return

  processing.value = true
  progressPercent.value = 0
  processedImages.value = []
  const totalImages = imageFilesURLs.value.length

  for (let i = 0; i < totalImages; ++i) {
    // Load image
    const img = await RawImage.fromURL(imageFilesURLs.value[i])

    // Pre-process image
    const { pixel_values } = await processor.value(img)

    // Predict alpha matte
    const { output } = await model.value({ input: pixel_values })

    const maskData = (await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(img.width, img.height)).data

    // Create new canvas
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return

    // Draw original image output to canvas
    ctx.drawImage(img.toCanvas(), 0, 0)

    // Update alpha channel
    const pixelData = ctx.getImageData(0, 0, img.width, img.height)
    for (let i = 0; i < maskData.length; ++i) {
      pixelData.data[4 * i + 3] = maskData[i]
    }

    ctx.putImageData(pixelData, 0, 0)
    processedImages.value.push(canvas.toDataURL('image/png'))

    // Update progress
    progressPercent.value = Math.round(((i + 1) / totalImages) * 100)
  }

  processing.value = false
  downloadReady.value = true
}

function downloadImage(index: number) {
  if (!processedImages.value || index >= processedImages.value.length || !imageFiles.value[index])
    return

  // Get original filename and create new filename with suffix
  const originalFileName = imageFiles.value[index].name
  const fileNameWithoutExt = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName
  const fileExt = originalFileName.substring(originalFileName.lastIndexOf('.')) || '.png'
  const newFileName = `${fileNameWithoutExt}-background-removed${fileExt}`

  const link = document.createElement('a')
  link.href = processedImages.value[index]
  link.download = newFileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function downloadAllImages() {
  if (!processedImages.value || processedImages.value.length === 0)
    return

  processedImages.value.forEach((_, index) => {
    setTimeout(() => downloadImage(index), index * 100)
  })
}
</script>

<template>
  <div flex flex-col items-center gap-4>
    <button
      bg="neutral-100 dark:neutral-800"
      w-full cursor-pointer rounded-lg px-3 py-2
      :disabled="processing"
      @click="processImages"
    >
      {{ processing ? 'Processing...' : 'Process' }}
    </button>

    <div h-full w-full flex gap-2>
      <div w="[50%]" border="2 solid neutral-200 dark:neutral-800" bg="neutral-50 dark:neutral-900" min-h="120" h="auto" overflow-hidden rounded-lg>
        <img v-for="(url, index) in imageFilesURLs" :key="index" :src="url" h-full w-full object-cover>
      </div>
      <div w="[50%]" border="2 solid neutral-200 dark:neutral-800" bg="neutral-50 dark:neutral-900" min-h="120" h="auto" relative overflow-hidden rounded-lg>
        <!-- Processing overlay with progress bar -->
        <div v-if="processing" bg="black/50" absolute inset-0 z-10 flex flex-col items-center justify-center>
          <div mb-4 text-white font-medium>
            {{ progressPercent }}%
          </div>
          <div bg="gray-200/30" w="70%" h-2 overflow-hidden rounded-full>
            <div
              bg="emerald-500"
              h-full
              :style="{ width: `${progressPercent}%` }"
              transition-all duration-200
            />
          </div>
        </div>

        <!-- Processed images -->
        <div v-for="(url, index) in processedImages" :key="index" relative class="group" h-full w-full>
          <img :src="url" h-full w-full object-cover>
          <div bg="black/0 group-hover:black/20" absolute inset-0 flex items-center justify-center transition-all duration-200>
            <button
              bg="emerald-500 hover:emerald-600"
              rounded-full p-2 text-white opacity-0 transition-all duration-200 group-hover:opacity-100
              @click="downloadImage(index)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Download all button -->
        <div v-if="processedImages && processedImages.length > 1" absolute bottom-2 right-2>
          <button
            bg="emerald-500 hover:emerald-600"
            rounded-full p-2 text-white
            @click="downloadAllImages"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
    <InputFile v-model="imageFiles" w-full />
  </div>
</template>
