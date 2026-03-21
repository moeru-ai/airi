<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'

import { Button } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger, EditableArea, EditableEditTrigger, EditableInput, EditablePreview, EditableRoot, EditableSubmitTrigger } from 'reka-ui'
import { computed, ref, watch } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../../../../stores/display-models'

const props = defineProps<{
  selectedModel?: DisplayModel
}>()
const emits = defineEmits<{
  (e: 'close', value: void): void
  (e: 'pick', value: DisplayModel | undefined): void
}>()

const displayModelStore = useDisplayModelsStore()
const { displayModelsFromIndexedDBLoading, displayModels } = storeToRefs(displayModelStore)

function handleRemoveModel(model: DisplayModel) {
  displayModelStore.removeDisplayModel(model.id)
}

const highlightDisplayModelCard = ref<string | undefined>(props.selectedModel?.id)

// 视图控制状态
const isListView = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const itemsPerPage = 4 // 每页显示数量

// 搜索过滤逻辑
const filteredModels = computed(() => {
  if (!searchQuery.value.trim())
    return displayModels.value
  return displayModels.value.filter(model =>
    model.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
  )
})

// 分页逻辑
const totalPages = computed(() => Math.ceil(filteredModels.value.length / itemsPerPage))
const paginatedModels = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return filteredModels.value.slice(start, start + itemsPerPage)
})

// 当搜索内容改变时，自动重置回第一页 (修复 AI 提到的 P2 问题)
watch(searchQuery, () => {
  currentPage.value = 1
})

watch(() => props.selectedModel?.id, (modelId) => {
  highlightDisplayModelCard.value = modelId
}, { immediate: true })

function handleAddLive2DModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return
  if (!file[0].name.endsWith('.zip'))
    return
  displayModelStore.addDisplayModel(DisplayModelFormat.Live2dZip, file[0])
}

function handlePick(m: DisplayModel) {
  highlightDisplayModelCard.value = m.id
  emits('pick', m)
  emits('close', undefined)
}

function handleMobilePick() {
  emits('pick', displayModels.value.find(model => model.id === highlightDisplayModelCard.value))
  emits('close', undefined)
}

function handleAddVRMModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return
  if (!file[0].name.endsWith('.vrm'))
    return
  displayModelStore.addDisplayModel(DisplayModelFormat.VRM, file[0])
}

const mapFormatRenderer: Record<DisplayModelFormat, string> = {
  [DisplayModelFormat.Live2dZip]: 'Live2D',
  [DisplayModelFormat.Live2dDirectory]: 'Live2D',
  [DisplayModelFormat.VRM]: 'VRM',
  [DisplayModelFormat.PMXDirectory]: 'MMD',
  [DisplayModelFormat.PMXZip]: 'MMD',
  [DisplayModelFormat.PMD]: 'MMD',
}

const live2dDialog = useFileDialog({ accept: '.zip', multiple: false, reset: true })
const vrmDialog = useFileDialog({ accept: '.vrm', multiple: false, reset: true })

live2dDialog.onChange(handleAddLive2DModel)
vrmDialog.onChange(handleAddVRMModel)
</script>

<template>
  <div pt="4 sm:0" gap="4 sm:6" h-full flex flex-col>
    <div flex items-center gap-2>
      <div w-full flex-1 text-xl>
        Model Selector
      </div>

      <button
        :class="[
          'bg-neutral-400/20 hover:neutral-400/45 dark:neutral-700/50 hover:dark:neutral-700/65',
          'flex items-center justify-center rounded-lg p-1.5 backdrop-blur-sm transition-all duration-200',
        ]"
        @click="isListView = !isListView"
      >
        <div :class="[isListView ? 'i-carbon:grid' : 'i-carbon:list', 'text-lg']" />
      </button>

      <div>
        <DropdownMenuRoot>
          <DropdownMenuTrigger
            bg="neutral-400/20 hover:neutral-400/45 active:neutral-400/60 dark:neutral-700/50 hover:dark:neutral-700/65 active:dark:neutral-700/90"
            flex items-center justify-center gap-1 rounded-lg px-2 py-1 backdrop-blur-sm
            transition="colors duration-200 ease-in-out"
            aria-label="Options for Display Models"
          >
            <div i-solar:add-circle-bold />
            <div>Add</div>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="will-change-[opacity,transform] dark:neutral-950/50 z-10000 max-w-45 rounded-lg bg-neutral-100/50 p-0.5 shadow-md outline-none backdrop-blur-sm"
              transition="colors duration-200 ease-in-out"
              align="end" side="bottom" :side-offset="8"
            >
              <DropdownMenuItem
                :class="[
                  'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none text-base sm:text-sm transition-colors duration-200',
                  'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20 data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200'
                ]"
                @click="live2dDialog.open()"
              >
                Live2D
              </DropdownMenuItem>
              <DropdownMenuItem
                :class="[
                  'relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none text-base sm:text-sm transition-colors duration-200',
                  'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20 data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200'
                ]"
                @click="vrmDialog.open()"
              >
                VRM
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </div>

    <div class="px-1">
      <div :class="['relative flex items-center group']">
        <div :class="['absolute left-3 text-neutral-400 group-focus-within:text-primary-400 transition-colors duration-200']">
          <div i-solar:magnifer-linear />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search models..."
          :class="[
            'w-full pl-9 pr-4 py-2 text-sm rounded-xl outline-none transition-all duration-200',
            'bg-neutral-100 dark:bg-neutral-800 border-2 border-transparent',
            'focus:border-primary-400/50 focus:bg-white dark:focus:bg-black',
          ]"
        >
      </div>
    </div>

    <div v-if="displayModelsFromIndexedDBLoading">
      Loading display models...
    </div>

    <div class="flex-1 overflow-x-auto overflow-y-hidden md:flex-none sm:overflow-x-hidden sm:overflow-y-scroll" h-full w-full>
      <div
        :class="[
          'w-full flex gap-2',
          isListView ? 'flex-col px-1' : 'md:grid lg:grid-cols-2 md:grid-cols-1 lg:max-h-80dvh',
        ]"
      >
        <div
          v-for="(model) of paginatedModels"
          :key="model.id"
          v-auto-animate
          :class="[
            'relative gap-2 cursor-pointer transition-all duration-200 border-2 rounded-xl',
            highlightDisplayModelCard === model.id ? 'border-primary-400 bg-primary-400/5' : 'border-transparent',
            isListView ? 'flex flex-row items-center p-2 min-h-16' : 'block h-full w-full md:flex md:flex-row',
          ]"
          @click="isListView ? handlePick(model) : (highlightDisplayModelCard = model.id)"
        >
          <template v-if="isListView">
            <div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
              <img v-if="model.previewImage" :src="model.previewImage" class="h-full w-full object-cover">
              <div v-else class="h-full w-full flex items-center justify-center opacity-50">
                <div i-solar:question-square-bold-duotone />
              </div>
            </div>
            <div class="min-w-0 flex-1 px-2">
              <div class="truncate text-sm font-bold dark:text-white">
                {{ model.name }}
              </div>
              <div class="flex items-center gap-1 text-xs text-neutral-500">
                <div i-solar:tag-horizontal-bold class="text-[10px]" />
                {{ mapFormatRenderer[model.format] }}
              </div>
            </div>
            <div v-if="highlightDisplayModelCard === model.id" class="i-solar:check-circle-bold mr-1 text-lg text-primary-400" />
          </template>

          <template v-else>
            <div absolute left-3 top-4 z-1>
              <DropdownMenuRoot>
                <DropdownMenuTrigger
                  class="h-7 w-7 flex items-center justify-center rounded-lg bg-neutral-900/20 text-white backdrop-blur-sm transition-colors duration-200 hover:bg-neutral-900/45"
                >
                  <div i-solar:menu-dots-bold />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    class="z-10000 max-w-45 rounded-lg bg-neutral-900/30 p-0.5 text-white shadow-md backdrop-blur-sm dark:bg-neutral-950/50"
                    align="start" side="bottom" :side-offset="4"
                  >
                    <DropdownMenuItem
                      class="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-white outline-none transition-colors duration-200 data-[highlighted]:bg-red-900/20 dark:data-[highlighted]:bg-red-100/20 data-[highlighted]:text-red-200"
                      @click.stop="handleRemoveModel(model)"
                    >
                      <div i-solar:trash-bin-minimalistic-bold-duotone class="mr-1" />
                      <div>Remove</div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </div>
            <div class="h-full min-w-80 w-full lg:min-h-60 md:min-w-70 sm:min-w-65" aspect="12/16" px-1 py-2>
              <img v-if="model.previewImage" :src="model.previewImage" h-full w-full rounded-lg object-cover transition-all duration-200>
              <div v-else bg="neutral-100 dark:neutral-900" relative h-full w-full flex flex-col items-center justify-center gap-2 overflow-hidden rounded-lg transition-all duration-200>
                <div i-solar:question-square-bold-duotone text-4xl opacity-75 />
                <div translate-y="100%" absolute top-0 flex flex-col translate-x--7 rotate-45 scale-250 gap-0 opacity-5>
                  <div text="sm" translate-x-7 translate-y--2 text-nowrap>
                    unavailable Preview unavailable Preview
                  </div>
                  <div text="sm" translate-x-0 translate-y--0 text-nowrap>
                    Preview unavailable Preview unavailable
                  </div>
                </div>
              </div>
            </div>
            <div w-full flex flex-col>
              <div w-full flex-1 p-2>
                <EditableRoot v-slot="{ isEditing }" :default-value="model.name" placeholder="Model Name..." class="flex gap-2" auto-resize>
                  <EditableArea class="w-[calc(100%-8px-1rem)] dark:text-white">
                    <EditablePreview class="line-clamp-1 w-[calc(100%-8px)] overflow-hidden text-ellipsis" />
                    <EditableInput class="outline-none w-[calc(100%-8px)]! placeholder:text-neutral-700 dark:placeholder:text-neutral-600" />
                  </EditableArea>
                  <EditableEditTrigger v-if="!isEditing">
                    <div i-solar:pen-2-line-duotone opacity-50 />
                  </EditableEditTrigger>
                  <div v-else class="flex gap-2">
                    <EditableSubmitTrigger>
                      <div i-solar:check-read-line-duotone opacity-50 />
                    </EditableSubmitTrigger>
                  </div>
                </EditableRoot>
                <div flex items-center gap-1 text="neutral-400 dark:neutral-600">
                  <div i-solar:tag-horizontal-bold />
                  <div>{{ mapFormatRenderer[model.format] }}</div>
                </div>
              </div>
              <Button class="hidden md:block" variant="secondary" @click.stop="handlePick(model)">
                Pick
              </Button>
            </div>
          </template>
        </div>
      </div>

      <div v-if="filteredModels.length === 0" class="flex flex-col items-center justify-center py-12 text-neutral-500">
        <div i-solar:magnifer-zoom-out-bold-duotone mb-2 text-4xl opacity-50 />
        <p text-sm>
          No models found matching "{{ searchQuery }}"
        </p>
      </div>
    </div>

    <div v-if="totalPages > 1" class="mt-2 flex items-center justify-center gap-4 border-t border-neutral-400/10 py-2">
      <Button
        variant="secondary"
        size="sm"
        :disabled="currentPage === 1"
        @click="currentPage--"
      >
        <div i-solar:alt-arrow-left-linear />
      </Button>

      <span class="text-xs text-neutral-500 font-mono">
        {{ currentPage }} / {{ totalPages }}
      </span>

      <Button
        variant="secondary"
        size="sm"
        :disabled="currentPage === totalPages"
        @click="currentPage++"
      >
        <div i-solar:alt-arrow-right-linear />
      </Button>
    </div>

    <Button class="block md:hidden" @click="handleMobilePick()">
      Confirm
    </Button>
  </div>
</template>
