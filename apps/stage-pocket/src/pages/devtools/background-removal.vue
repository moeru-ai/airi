<script setup lang="ts">
import type { PreTrainedModel, Processor } from '@huggingface/transformers'

import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers'
import { Button, Checkbox, InputFile } from '@proj-airi/ui'
import { check } from 'gpuu/webgpu'
import { computed, onMounted, ref, watch } from 'vue'

const model = ref<PreTrainedModel>()
const processor = ref<Processor>()
const error = ref<unknown>()
const loading = ref(true)
const processing = ref(false)
const progressPercent = ref(0)
const currentProcessingIndex = ref(-1)
const autoProcess = ref(false)
const previewImage = ref<string | null>(null)
const previewPosition = ref({ x: 0, y: 0 })

interface ImageItem {
  file: File
  originalUrl: string
  processedUrl: string | null
  status: 'pending' | 'processing' | 'done' | 'error'
}

const imageItems = ref<ImageItem[]>([])
const imageFiles = ref<File[]>([])

const pendingCount = computed(() => imageItems.value.filter(item => item.status === 'pending').length)
const doneCount = computed(() => imageItems.value.filter(item => item.status === 'done').length)

// Watch for new files and add to imageItems
watch(imageFiles, (newFiles) => {
  if (newFiles.length === 0)
    return

  const existingNames = new Set(imageItems.value.map(item => item.file.name))
  const newItems: ImageItem[] = newFiles
    .filter(file => !existingNames.has(file.name))
    .map(file => ({
      file,
      originalUrl: URL.createObjectURL(file),
      processedUrl: null,
      status: 'pending' as const,
    }))

  imageItems.value.push(...newItems)

  // Auto process if enabled
  if (autoProcess.value && newItems.length > 0 && !processing.value) {
    processAllImages()
  }
})

// Watch for autoProcess toggle - process pending images when enabled
watch(autoProcess, (enabled) => {
  if (enabled && !processing.value && pendingCount.value > 0) {
    processAllImages()
  }
})

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

async function processImage(item: ImageItem, index: number): Promise<void> {
  if (!model.value || !processor.value)
    return

  try {
    item.status = 'processing'
    currentProcessingIndex.value = index

    // Load image
    const img = await RawImage.fromURL(item.originalUrl)

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
    for (let j = 0; j < maskData.length; ++j) {
      pixelData.data[4 * j + 3] = maskData[j]
    }

    ctx.putImageData(pixelData, 0, 0)
    item.processedUrl = canvas.toDataURL('image/png')
    item.status = 'done'
  }
  catch {
    item.status = 'error'
  }
}

async function processAllImages() {
  if (!model.value || !processor.value || processing.value)
    return

  processing.value = true
  progressPercent.value = 0

  const pendingItems = imageItems.value.filter(item => item.status === 'pending')
  const totalImages = pendingItems.length

  for (let i = 0; i < totalImages; ++i) {
    await processImage(pendingItems[i], imageItems.value.indexOf(pendingItems[i]))
    progressPercent.value = Math.round(((i + 1) / totalImages) * 100)
  }

  processing.value = false
  currentProcessingIndex.value = -1
}

function downloadImage(index: number) {
  const item = imageItems.value[index]
  if (!item || !item.processedUrl)
    return

  // Get original filename and create new filename with suffix
  const originalFileName = item.file.name
  const fileNameWithoutExt = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName
  const newFileName = `${fileNameWithoutExt}-background-removed.png`

  const link = document.createElement('a')
  link.href = item.processedUrl
  link.download = newFileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function downloadAllImages() {
  const doneItems = imageItems.value.filter(item => item.status === 'done')
  if (doneItems.length === 0)
    return

  doneItems.forEach((_, i) => {
    const index = imageItems.value.indexOf(doneItems[i])
    setTimeout(() => downloadImage(index), i * 100)
  })
}

function removeImage(index: number) {
  const item = imageItems.value[index]
  if (item.originalUrl)
    URL.revokeObjectURL(item.originalUrl)
  imageItems.value.splice(index, 1)
}

function clearAllImages() {
  imageItems.value.forEach((item) => {
    if (item.originalUrl)
      URL.revokeObjectURL(item.originalUrl)
  })
  imageItems.value = []
}

function showPreview(url: string, event: MouseEvent) {
  previewImage.value = url
  updatePreviewPosition(event)
}

function updatePreviewPosition(event: MouseEvent) {
  previewPosition.value = {
    x: event.clientX + 16,
    y: event.clientY + 16,
  }
}

function hidePreview() {
  previewImage.value = null
}
</script>

<template>
  <div flex flex-col gap-4>
    <!-- Loading state -->
    <div v-if="loading" flex items-center justify-center gap-2 py-8 text-neutral-500>
      <div i-svg-spinners:ring-resize text-2xl />
      <span>Loading model...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" rounded-lg bg-red-100 p-4 text-red-700 dark:bg-red-900 dark:text-red-200>
      {{ error }}
    </div>

    <!-- Main content -->
    <template v-else>
      <!-- File upload area -->
      <InputFile v-model="imageFiles" accept="image/*" multiple w-full />

      <!-- Controls -->
      <div flex flex-wrap items-center justify-between gap-4>
        <div flex items-center gap-3>
          <label flex cursor-pointer items-center gap-2>
            <Checkbox v-model="autoProcess" />
            <span text-sm>Auto process on upload</span>
          </label>
        </div>
        <div flex gap-2>
          <Button
            v-if="pendingCount > 0"
            :label="processing ? `Processing... ${progressPercent}%` : `Process ${pendingCount} image${pendingCount > 1 ? 's' : ''}`"
            :disabled="processing || !model"
            :loading="processing"
            @click="processAllImages"
          />
          <Button
            v-if="doneCount > 0"
            variant="secondary"
            :label="`Download All (${doneCount})`"
            icon="i-solar:download-minimalistic-bold"
            @click="downloadAllImages"
          />
          <Button
            v-if="imageItems.length > 0"
            variant="secondary-muted"
            label="Clear All"
            icon="i-solar:trash-bin-trash-line-duotone"
            @click="clearAllImages"
          />
        </div>
      </div>

      <!-- Image Table -->
      <div overflow-x-auto rounded-lg border="1 solid neutral-200 dark:neutral-700">
        <table w-full text-left text-sm>
          <thead bg="neutral-100 dark:neutral-800">
            <tr>
              <th px-4 py-3 font-medium>
                Original
              </th>
              <th px-4 py-3 font-medium>
                Processed
              </th>
              <th px-4 py-3 font-medium>
                Filename
              </th>
              <th px-4 py-3 font-medium>
                Status
              </th>
              <th px-4 py-3 font-medium>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="imageItems.length === 0">
              <td colspan="5" px-4 py-8 text-center text-neutral-400>
                No images uploaded yet
              </td>
            </tr>
            <tr
              v-for="(item, index) in imageItems"
              :key="item.file.name"
              border="t 1 solid neutral-200 dark:neutral-700"
              :class="item.status === 'processing' ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''"
            >
              <!-- Original thumbnail -->
              <td px-4 py-3>
                <div
                  h-16 w-16 cursor-pointer overflow-hidden rounded-lg border="1 solid neutral-200 dark:neutral-700"
                  @mouseenter="showPreview(item.originalUrl, $event)"
                  @mousemove="updatePreviewPosition"
                  @mouseleave="hidePreview"
                >
                  <img :src="item.originalUrl" h-full w-full object-cover>
                </div>
              </td>

              <!-- Processed thumbnail -->
              <td px-4 py-3>
                <div
                  h-16 w-16 overflow-hidden rounded-lg border="1 solid neutral-200 dark:neutral-700"
                  :class="item.processedUrl ? 'cursor-pointer' : ''"
                  bg="[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%3E%3Crect%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23ccc%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23ccc%22%2F%3E%3C%2Fsvg%3E')]"
                  @mouseenter="item.processedUrl && showPreview(item.processedUrl, $event)"
                  @mousemove="updatePreviewPosition"
                  @mouseleave="hidePreview"
                >
                  <img v-if="item.processedUrl" :src="item.processedUrl" h-full w-full object-cover>
                  <div v-else-if="item.status === 'processing'" h-full w-full flex items-center justify-center bg="neutral-100 dark:neutral-800">
                    <div i-svg-spinners:ring-resize text-emerald-500 />
                  </div>
                  <div v-else h-full w-full flex items-center justify-center bg="neutral-100 dark:neutral-800" text-neutral-400>
                    -
                  </div>
                </div>
              </td>

              <!-- Filename -->
              <td max-w-48 truncate px-4 py-3 :title="item.file.name">
                {{ item.file.name }}
              </td>

              <!-- Status -->
              <td px-4 py-3>
                <span
                  inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium
                  :class="{
                    'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400': item.status === 'pending',
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400': item.status === 'processing',
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400': item.status === 'done',
                    'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400': item.status === 'error',
                  }"
                >
                  <div v-if="item.status === 'processing'" i-svg-spinners:ring-resize text-xs />
                  <div v-else-if="item.status === 'done'" i-solar:check-circle-bold text-xs />
                  <div v-else-if="item.status === 'error'" i-solar:close-circle-bold text-xs />
                  <div v-else i-solar:clock-circle-linear text-xs />
                  {{ item.status === 'pending' ? 'Pending' : item.status === 'processing' ? 'Processing' : item.status === 'done' ? 'Done' : 'Error' }}
                </span>
              </td>

              <!-- Actions -->
              <td px-4 py-3>
                <div flex gap-2>
                  <Button
                    v-if="item.status === 'done'"
                    size="sm"
                    icon="i-solar:download-minimalistic-bold"
                    @click="downloadImage(index)"
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    icon="i-solar:trash-bin-trash-bold"
                    :disabled="item.status === 'processing'"
                    @click="removeImage(index)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Preview tooltip -->
    <Teleport to="body">
      <div
        v-if="previewImage"

        pointer-events-none fixed z-50 overflow-hidden rounded-xl shadow-2xl
        border="1 solid neutral-200 dark:neutral-700"
        bg="[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%3E%3Crect%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23ccc%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23ccc%22%2F%3E%3C%2Fsvg%3E')]"
        :style="{
          left: `${previewPosition.x}px`,
          top: `${previewPosition.y}px`,
          maxWidth: '400px',
          maxHeight: '400px',
        }"
      >
        <img :src="previewImage" max-h-96 max-w-96 object-contain>
      </div>
    </Teleport>
  </div>
</template>
