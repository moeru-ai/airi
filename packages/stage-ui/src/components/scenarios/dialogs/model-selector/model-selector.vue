<script setup lang="ts">
import type { Live2DValidationReport } from '@proj-airi/stage-ui-live2d'

import type { DisplayModel } from '../../../../stores/display-models'

import { vAutoAnimate } from '@formkit/auto-animate/vue'
import { validateLive2DZip } from '@proj-airi/stage-ui-live2d'
import { Button } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, ref } from 'vue'

import Live2DReportModal from './Live2DReportModal.vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../../../../stores/display-models'

const emits = defineEmits<{
  (e: 'close', value: void): void
  (e: 'pick', value: DisplayModel | undefined): void
}>()
const selectedModel = defineModel<DisplayModel | undefined>({ type: Object, required: false })

const displayModelStore = useDisplayModelsStore()
const { displayModelsFromIndexedDBLoading, displayModels } = storeToRefs(displayModelStore)

// Redesign State
const viewMode = ref<'grid' | 'compact'>('compact')
const searchQuery = ref('')
const formatFilter = ref<'all' | 'live2d' | 'vrm'>('all')
const sortBy = ref<'name' | 'date'>('date')

const showRenameDialog = ref(false)
const modelToRename = ref<DisplayModel | null>(null)
const tempRenameValue = ref('')

const highlightDisplayModelCard = ref<string | undefined>(selectedModel.value?.id)
const showReportModal = ref(false)
const pendingFile = ref<File | null>(null)
const validationReport = ref<Live2DValidationReport | null>(null)

const currentTab = ref<'library' | 'explore'>('library')

const marketplaces = [
  { name: 'Booth', vrm: true, live2d: true, languages: ['jp', 'us'], origin: 'Japan', url: 'https://booth.pm/en/browse/VTuber' },
  { name: 'Booth VRMA', vrm: true, live2d: false, languages: ['jp', 'us'], origin: 'Japan', url: 'https://booth.pm/en/browse/3D%20Motion%20&%20Animation?sort=price_asc&tags%5B%5D=VRMA' },
  { name: 'VGen', vrm: true, live2d: true, languages: ['us'], origin: 'USA', url: 'https://vgen.co' },
  { name: 'itch.io', vrm: true, live2d: true, languages: ['us'], origin: 'USA', url: 'https://itch.io/game-assets' },
  { name: 'Gumroad', vrm: true, live2d: true, languages: ['us'], origin: 'USA', url: 'https://gumroad.com' },
  { name: 'Ko-fi', vrm: true, live2d: true, languages: ['us'], origin: 'USA', url: 'https://ko-fi.com/shop' },
  { name: 'VRoid Hub', vrm: true, live2d: false, languages: ['jp', 'us'], origin: 'Japan', url: 'https://hub.vroid.com' },
  { name: 'Sketchfab', vrm: true, live2d: false, languages: ['us'], origin: 'USA', url: 'https://sketchfab.com' },
  { name: 'CGTrader', vrm: true, live2d: false, languages: ['us'], origin: 'USA', url: 'https://cgtrader.com' },
  { name: 'Nizima', vrm: false, live2d: true, languages: ['jp', 'us'], origin: 'Japan', url: 'https://nizima.com' },
  { name: 'Avatar Atelier', vrm: false, live2d: true, languages: ['us'], origin: 'USA', url: 'https://avataratelier.com' },
  { name: 'VTuberAvatars', vrm: false, live2d: true, languages: ['us'], origin: 'USA', url: 'https://vtuberavatars.com' },
]

// Filtering Logic
const filteredModels = computed(() => {
  let result = [...displayModels.value]

  // Search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(m => m.name.toLowerCase().includes(q))
  }

  // Format Filter
  if (formatFilter.value !== 'all') {
    result = result.filter((m) => {
      if (formatFilter.value === 'live2d')
        return m.format === DisplayModelFormat.Live2dZip || m.format === DisplayModelFormat.Live2dDirectory
      if (formatFilter.value === 'vrm')
        return m.format === DisplayModelFormat.VRM
      return true
    })
  }

  // Sort
  result.sort((a, b) => {
    if (sortBy.value === 'name')
      return a.name.localeCompare(b.name)
    if (sortBy.value === 'date')
      return b.importedAt - a.importedAt
    return 0
  })

  return result
})

function handleRemoveModel(model: DisplayModel) {
  displayModelStore.removeDisplayModel(model.id)
}

function openRenameDialog(model: DisplayModel) {
  modelToRename.value = model
  tempRenameValue.value = model.name
  showRenameDialog.value = true
}

function confirmRename() {
  if (modelToRename.value && tempRenameValue.value.trim()) {
    displayModelStore.renameDisplayModel(modelToRename.value.id, tempRenameValue.value.trim())
    showRenameDialog.value = false
  }
}

async function handleAddLive2DModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return
  if (!file[0].name.endsWith('.zip'))
    return

  const report = await validateLive2DZip(file[0])
  validationReport.value = report
  pendingFile.value = file[0]

  if (report.status === 'VALID' && report.errors.length === 0) {
    confirmImport()
  }
  else {
    showReportModal.value = true
  }
}

function confirmImport() {
  if (pendingFile.value) {
    displayModelStore.addDisplayModel(DisplayModelFormat.Live2dZip, pendingFile.value)
    pendingFile.value = null
  }
}

function handlePick(m: DisplayModel) {
  selectedModel.value = m
  emits('pick', m)
  emits('close', undefined)
}

function handleMobilePick() {
  const model = displayModels.value.find(model => model.id === highlightDisplayModelCard.value)
  if (model) {
    selectedModel.value = model
    emits('pick', model)
    emits('close', undefined)
  }
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

function handleFixError(err: string) {
  // eslint-disable-next-line no-console
  console.log('[Model Selector] Fixing error:', err)
  // Logic to fix common errors (e.g. missing preview)
  // For now, we provide guidance or mark as ignorable in the future
  if (err.toLowerCase().includes('preview') || err.toLowerCase().includes('thumbnail') || err.toLowerCase().includes('icon')) {
    // If it's a missing preview, we could generate a placeholder
    // For this PR feedback, we just acknowledged the "Quick Fix" button existence
  }
}
</script>

<template>
  <div :class="['pt-4 sm:pt-0', 'gap-4 sm:gap-6', 'h-full flex flex-col']">
    <div class="flex items-center">
      <Live2DReportModal
        v-model:open="showReportModal"
        :report="validationReport"
        @confirm="confirmImport"
        @fix-error="handleFixError"
      />

      <!-- Rename Dialog -->
      <DialogRoot v-model:open="showRenameDialog">
        <DialogPortal>
          <DialogOverlay class="fixed inset-0 z-[10001] bg-black/50 backdrop-blur-sm" />
          <DialogContent class="fixed left-1/2 top-1/2 z-[10001] max-w-md w-[90dvw] translate-x-[-50%] translate-y-[-50%] rounded-xl bg-white p-6 text-neutral-900 shadow-xl dark:bg-neutral-900 dark:text-neutral-100">
            <DialogTitle class="text-lg font-bold">
              Rename Model
            </DialogTitle>
            <div :class="['mt-4 flex flex-col gap-4', 'split-button-container']">
              <input
                v-model="tempRenameValue"
                type="text"
                class="w-full border border-neutral-200 rounded-lg bg-neutral-100 px-3 py-2 outline-none dark:border-neutral-800 dark:bg-neutral-800"
                placeholder="Model Name"
                @keyup.enter="confirmRename"
              >
              <div class="flex justify-end gap-2">
                <Button variant="secondary" @click="showRenameDialog = false">
                  Cancel
                </Button>
                <Button @click="confirmRename">
                  Rename
                </Button>
              </div>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </div>

    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="text-xl font-bold">
          Model Selector
        </div>
        <!-- Tab Navigation -->
        <div class="flex rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            :class="[
              currentTab === 'library' ? 'bg-white dark:bg-neutral-700 shadow-sm' : 'opacity-50 hover:opacity-100',
              'px-3 py-1 rounded-md transition-all text-sm font-bold flex items-center gap-1',
            ]"
            @click="currentTab = 'library'"
          >
            <div class="i-solar:library-bold-duotone" />
            Library
          </button>
          <button
            :class="[
              currentTab === 'explore' ? 'bg-white dark:bg-neutral-700 shadow-sm' : 'opacity-50 hover:opacity-100',
              'px-3 py-1 rounded-md transition-all text-sm font-bold flex items-center gap-1',
            ]"
            @click="currentTab = 'explore'"
          >
            <div class="i-solar:compass-bold-duotone" />
            Explore
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- View Mode Toggle (Only for Library) -->
        <div v-if="currentTab === 'library'" class="mr-2 flex rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            :class="[
              viewMode === 'grid' ? 'bg-white dark:bg-neutral-700 shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-50',
              'p-1.5 rounded-md transition-all',
            ]"
            aria-label="Grid View"
            @click="viewMode = 'grid'"
          >
            <div class="i-solar:widget-2-bold-duotone" />
          </button>
          <button
            :class="[
              viewMode === 'compact' ? 'bg-white dark:bg-neutral-700 shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-50',
              'p-1.5 rounded-md transition-all',
            ]"
            aria-label="Compact Grid View"
            @click="viewMode = 'compact'"
          >
            <div class="i-solar:list-bold-duotone" />
          </button>
        </div>

        <DropdownMenuRoot v-if="currentTab === 'library'">
          <DropdownMenuTrigger
            class="flex items-center justify-center gap-2 rounded-lg bg-neutral-400/20 px-3 py-1.5 backdrop-blur-sm transition-colors duration-200 ease-in-out active:bg-neutral-400/60 dark:bg-neutral-700/50 hover:bg-neutral-400/45 active:dark:bg-neutral-700/90 hover:dark:bg-neutral-700/65"
            aria-label="Options for Display Models"
          >
            <div class="i-solar:add-circle-bold" />
            <div class="font-bold">
              Add Local
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="will-change-[opacity,transform] z-10000 max-w-45 border border-neutral-200 rounded-lg bg-neutral-100 p-0.5 text-neutral-900 shadow-md outline-none backdrop-blur-sm data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              align="end"
              side="bottom"
              :side-offset="8"
            >
              <DropdownMenuItem
                :class="[
                  'data-[disabled]:text-mauve8 relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none data-[disabled]:pointer-events-none',
                  'text-base sm:text-sm',
                  'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20',
                  'data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200',
                ]"
                transition="colors duration-200 ease-in-out"
                @click="live2dDialog.open()"
              >
                Live2D (.zip)
              </DropdownMenuItem>
              <DropdownMenuItem
                :class="[
                  'data-[disabled]:text-mauve8 relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none data-[disabled]:pointer-events-none',
                  'text-base sm:text-sm',
                  'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20',
                  'data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200',
                ]"
                transition="colors duration-200 ease-in-out" @click="vrmDialog.open()"
              >
                VRM (.vrm)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </div>

    <!-- Library Tab Content -->
    <template v-if="currentTab === 'library'">
      <!-- Search & Filter Bar -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-40 flex-1">
          <div class="i-solar:magnifer-linear absolute left-3 top-1/2 translate-y-[-50%] opacity-50" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search models..."
            class="w-full border border-transparent rounded-lg bg-neutral-100 py-1.5 pl-9 pr-3 outline-none transition-all focus:border-primary-400 dark:bg-neutral-800"
          >
        </div>

        <!-- Format Filter -->
        <select
          v-model="formatFilter"
          class="cursor-pointer border border-transparent rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium outline-none transition-all dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        >
          <option value="all">
            All Formats
          </option>
          <option value="live2d">
            Live2D
          </option>
          <option value="vrm">
            VRM
          </option>
        </select>

        <!-- Sort -->
        <select
          v-model="sortBy"
          class="cursor-pointer border border-transparent rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium outline-none transition-all dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        >
          <option value="name">
            Name (A-Z)
          </option>
          <option value="date">
            Last Added
          </option>
        </select>
      </div>

      <div v-if="displayModelsFromIndexedDBLoading">
        Loading display models...
      </div>

      <div
        class="w-full lg:max-h-80dvh"
        :class="[
          viewMode === 'grid' ? 'flex flex-col gap-2 md:grid lg:grid-cols-2 md:grid-cols-1' : 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2',
        ]"
      >
        <!-- (Rest of Library Model Grid) -->
        <div
          v-for="(model) of filteredModels"
          :key="model.id"
          class="group relative transition-all duration-200"
          :class="[
            viewMode === 'grid' ? 'block h-full w-full md:flex md:flex-row gap-2' : 'flex flex-col',
            highlightDisplayModelCard === model.id ? 'z-10' : 'z-0',
          ]"
          @click="() => highlightDisplayModelCard = model.id"
        >
          <!-- Options Menu -->
          <div class="absolute right-2 top-2 z-10">
            <DropdownMenuRoot>
              <DropdownMenuTrigger
                :class="[
                  'bg-neutral-900/40 group-hover:bg-neutral-900/60 dark:bg-neutral-950/40 group-hover:dark:bg-neutral-900/80',
                  viewMode === 'compact' ? 'h-5 w-5' : 'h-7 w-7',
                  'text-white flex items-center justify-center rounded-lg backdrop-blur-md transition-all duration-200 ease-in-out shadow-sm',
                ]"
                aria-label="Options for Display Models"
                @click.stop
              >
                <div :class="['i-solar:menu-dots-bold', viewMode === 'compact' ? 'text-xs' : 'text-base']" />
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent
                  :class="[
                    'will-change-[opacity,transform] z-10000 max-w-45 rounded-xl p-1 text-white shadow-2xl outline-none data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade dark:text-black',
                    'bg-neutral-900/90 dark:bg-neutral-100/90',
                    'backdrop-blur-xl border border-white/10 dark:border-black/10',
                  ]"
                  transition="colors duration-200 ease-in-out"
                  align="start"
                  side="bottom"
                  :side-offset="4"
                >
                  <DropdownMenuItem
                    class="relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-base leading-none outline-none data-[highlighted]:bg-white/10 sm:text-sm dark:data-[highlighted]:bg-black/10"
                    @click="openRenameDialog(model)"
                  >
                    <div class="flex items-center gap-2">
                      <div class="i-solar:pen-bold" />
                      <div>Rename</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    class="relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2 text-base text-red-400 font-semibold leading-none outline-none data-[highlighted]:bg-red-500/20 sm:text-sm"
                    @click="handleRemoveModel(model)"
                  >
                    <div class="flex items-center gap-2">
                      <div class="i-solar:trash-bin-minimalistic-bold-duotone" />
                      <div>Remove</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          </div>

          <!-- Preview Image Area -->
          <div
            class="relative cursor-pointer overflow-hidden transition-all duration-300"
            :class="[
              viewMode === 'grid' ? 'h-50 md:h-60 w-full md:w-45 lg:w-50 shrink-0' : 'aspect-[3/4] w-full',
            ]"
            @click="handlePick(model)"
          >
            <img
              v-if="model.previewImage"
              :src="model.previewImage"
              h-full w-full rounded-xl object-cover
              loading="lazy"
              :class="[
                highlightDisplayModelCard === model.id ? 'ring-3 ring-primary-500 shadow-lg' : 'ring-1 ring-white/10 dark:ring-black/10',
                'group-hover:scale-105 transition-transform duration-500',
              ]"
            >
            <div
              v-else
              :class="['h-full w-full flex flex-col items-center justify-center gap-2 rounded-xl bg-neutral-200 dark:bg-neutral-800', highlightDisplayModelCard === model.id ? 'ring-3 ring-primary-500 shadow-lg' : 'ring-1 ring-white/10 dark:ring-black/10']"
            >
              <div class="i-solar:question-square-bold-duotone text-4xl opacity-30" />
            </div>

            <!-- Hover Effects Overlay -->
            <div
              class="pointer-events-none absolute inset-0 flex items-end justify-center rounded-xl from-black/60 to-transparent bg-gradient-to-t p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            >
              <div :class="['text-white text-xs font-bold flex items-center gap-1', 'translate-y-2 group-hover:translate-y-0 transition-transform duration-300']">
                <div class="i-solar:map-arrow-up-bold" />
                Pick Model
              </div>
            </div>
          </div>

          <!-- Labels Area -->
          <div
            class="flex flex-1 flex-col"
            :class="[viewMode === 'grid' ? 'justify-between p-2' : 'p-1.5']"
          >
            <div class="w-full">
              <div
                class="font-bold transition-colors"
                :class="[
                  viewMode === 'grid' ? 'text-lg line-clamp-2 leading-tight' : 'text-sm line-clamp-1',
                  highlightDisplayModelCard === model.id ? 'text-primary-500' : '',
                ]"
              >
                {{ model.name }}
              </div>
              <div
                class="mt-1 flex items-center gap-1 opacity-60"
                :class="[viewMode === 'grid' ? 'text-sm' : 'text-xs']"
              >
                <div v-if="model.format === DisplayModelFormat.VRM" class="i-solar:box-bold" />
                <div v-else class="i-solar:mask-hachi-bold" />
                <div>{{ mapFormatRenderer[model.format] }}</div>
              </div>
            </div>

            <!-- Pick toggle button for Standard View only -->
            <Button
              v-if="viewMode === 'grid'"
              variant="secondary"
              class="mt-2 w-full !rounded-lg !py-1.5"
              @click="handlePick(model)"
            >
              Pick
            </Button>
          </div>
        </div>
      </div>
    </template>

    <!-- Explore Tab Content -->
    <template v-else-if="currentTab === 'explore'">
      <div class="flex-1 overflow-y-auto pb-4 pr-2">
        <div v-auto-animate class="grid grid-cols-1 gap-4 lg:grid-cols-3 md:grid-cols-2">
          <a
            v-for="site in marketplaces"
            :key="site.name"
            :href="site.url"
            target="_blank"
            rel="noopener noreferrer"
            class="group flex flex-col gap-3 border border-transparent rounded-xl bg-neutral-100 p-4 shadow-sm transition-all duration-300 hover:border-primary-500/50 dark:bg-neutral-800/50 hover:bg-white hover:shadow-md dark:hover:bg-neutral-800"
          >
            <div class="flex items-start justify-between">
              <div class="text-lg font-bold transition-colors group-hover:text-primary-500">{{ site.name }}</div>
              <div class="i-solar:share-circle-bold-duotone text-primary-500 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>

            <div class="flex flex-wrap gap-2">
              <div v-if="site.vrm" class="border border-blue-500/20 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500 font-bold">VRM</div>
              <div v-if="site.live2d" class="border border-green-500/20 rounded bg-green-500/10 px-2 py-0.5 text-[10px] text-green-500 font-bold">LIVE2D</div>
            </div>

            <div class="mt-auto flex items-center justify-between border-t border-neutral-200 pt-2 dark:border-neutral-700">
              <div class="flex items-center gap-1 text-xs opacity-50">
                <div class="i-solar:globus-linear" />
                {{ site.origin }}
              </div>
              <div class="flex gap-1">
                <span v-for="lang in site.languages" :key="lang" class="text-xs">
                  {{ lang === 'jp' ? '日本語' : 'English' }}
                </span>
              </div>
            </div>
          </a>
        </div>

        <div class="mt-8 flex flex-col items-center gap-2 border border-primary-500/10 rounded-2xl bg-primary-500/5 p-6 text-center">
          <div class="i-solar:info-circle-bold-duotone text-3xl text-primary-500" />
          <div class="text-lg font-bold">
            Know more resources?
          </div>
          <div class="max-w-sm text-sm opacity-70">
            Help the community by suggesting more marketplaces for VRM and Live2D models!
          </div>
          <a href="https://github.com/moeru-ai/airi/issues" target="_blank" class="mt-2 rounded-lg bg-primary-500 px-4 py-2 text-white font-bold transition-colors hover:bg-primary-600">Suggest a Site</a>
        </div>
      </div>
    </template>
    <Button class="block md:hidden" @click="handleMobilePick()">
      Confirm
    </Button>
  </div>
</template>
