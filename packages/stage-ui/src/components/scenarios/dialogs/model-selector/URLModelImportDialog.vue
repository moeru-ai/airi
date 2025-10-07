<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui'
import { ref } from 'vue'

import Button from '../../../misc/Button.vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../../../../stores/display-models'

const displayModelStore = useDisplayModelsStore()

const isOpen = defineModel<boolean>('open', { default: false })
const url = ref('')
const format = ref<DisplayModelFormat | 'auto'>('auto')
const isLoading = ref(false)
const errorMessage = ref('')

const formatOptions = [
  { value: 'auto', label: 'Auto Detect' },
  { value: DisplayModelFormat.VRM, label: 'VRM' },
  { value: DisplayModelFormat.Live2dZip, label: 'Live2D (ZIP)' },
]

async function handleImport() {
  if (!url.value.trim()) {
    errorMessage.value = 'Please enter a valid URL'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const selectedFormat = format.value === 'auto' ? undefined : format.value
    await displayModelStore.addDisplayModelFromURL(url.value.trim(), selectedFormat)

    // Reset and close
    url.value = ''
    format.value = 'auto'
    isOpen.value = false
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to import model from URL'
    console.error('Import error:', error)
  }
  finally {
    isLoading.value = false
  }
}

function handleCancel() {
  url.value = ''
  format.value = 'auto'
  errorMessage.value = ''
  isOpen.value = false
}
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-10000 bg-black/20 backdrop-blur-sm data-[state=open]:animate-overlayShow"
      />
      <DialogContent
        class="fixed left-[50%] top-[50%] z-10001 max-h-[85vh] max-w-[500px] w-[90vw] translate-x-[-50%] translate-y-[-50%] rounded-[6px] bg-white p-[25px] shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] data-[state=open]:animate-contentShow dark:bg-neutral-900 focus:outline-none"
      >
        <DialogTitle class="m-0 text-[17px] text-neutral-900 font-semibold dark:text-neutral-100">
          Import Model from URL
        </DialogTitle>
        <DialogDescription class="mb-5 mt-[10px] text-[15px] text-neutral-700 leading-normal dark:text-neutral-400">
          Import VRM or Live2D models from a direct URL. Supports .vrm files, .zip files, VPM JSON, or model3.json (will automatically fetch all related resources). The model will be cached for offline use.
        </DialogDescription>

        <fieldset class="mb-[15px] flex flex-col gap-2">
          <label class="text-[15px] text-neutral-900 font-medium leading-[35px] dark:text-neutral-100" for="url">
            Model URL
          </label>
          <input
            id="url"
            v-model="url"
            class="h-[35px] w-full inline-flex flex-1 items-center justify-center rounded-[4px] px-[10px] text-[15px] text-neutral-900 leading-none shadow-[0_0_0_1px] shadow-neutral-300 outline-none dark:bg-neutral-800 dark:text-neutral-100 dark:shadow-neutral-700 focus:shadow-[0_0_0_2px] focus:shadow-primary-500 dark:focus:shadow-primary-500"
            placeholder="https://example.com/model.vrm or .model3.json or .zip"
            :disabled="isLoading"
          >
        </fieldset>

        <fieldset class="mb-[15px] flex flex-col gap-2">
          <label class="text-[15px] text-neutral-900 font-medium leading-[35px] dark:text-neutral-100" for="format">
            Format
          </label>
          <select
            id="format"
            v-model="format"
            class="h-[35px] w-full inline-flex flex-1 items-center justify-center rounded-[4px] px-[10px] text-[15px] text-neutral-900 leading-none shadow-[0_0_0_1px] shadow-neutral-300 outline-none dark:bg-neutral-800 dark:text-neutral-100 dark:shadow-neutral-700 focus:shadow-[0_0_0_2px] focus:shadow-primary-500 dark:focus:shadow-primary-500"
            :disabled="isLoading"
          >
            <option v-for="opt in formatOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </fieldset>

        <div v-if="errorMessage" class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ errorMessage }}
        </div>

        <div class="mt-[25px] flex justify-end gap-2">
          <DialogClose as-child>
            <Button variant="secondary" :disabled="isLoading" @click="handleCancel">
              Cancel
            </Button>
          </DialogClose>
          <Button :disabled="isLoading || !url.trim()" @click="handleImport">
            <span v-if="isLoading" class="i-svg-spinners:90-ring-with-bg mr-2" />
            {{ isLoading ? 'Importing...' : 'Import' }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
