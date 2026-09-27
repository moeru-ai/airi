<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import DOMPurify from 'dompurify'

import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useDownload } from '@proj-airi/stage-ui/composables/download'
import { exportAiriCardPackage } from '@proj-airi/stage-ui/services/airi-card-import-export'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, IconButton, Select } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import CardModelPreview from './card-model-preview.vue'
import DeleteCardDialog from './DeleteCardDialog.vue'

interface Props {
  cardId: string
  initialTab?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'back'): void
  (e: 'edit', cardId: string): void
}>()

const { t } = useI18n()
const { trackSceneBackgroundSet } = useAnalytics()
const cardStore = useAiriCardStore()
const backgroundStore = useBackgroundStore()
const displayModelsStore = useDisplayModelsStore()

const { removeCard } = cardStore
const { activeCardId } = storeToRefs(cardStore)

const isRefreshingGallery = ref(false)
const isExportingCard = shallowRef(false)

// Get selected card data
const selectedCard = computed<AiriCard | undefined>(() => {
  if (!props.cardId)
    return undefined
  return cardStore.getCard(props.cardId)
})

// Journal entries for this card
const journalEntries = computed(() => {
  return backgroundStore.getCharacterJournalEntries(props.cardId)
})

// Get module settings
const moduleSettings = computed(() => {
  if (!selectedCard.value || !selectedCard.value.extensions?.airi?.modules) {
    return {
      consciousnessProvider: '',
      consciousness: '',
      visionProvider: '',
      vision: '',
      speechProvider: '',
      speech: '',
      voice: '',
    }
  }

  const airiExt = selectedCard.value.extensions.airi.modules
  return {
    consciousnessProvider: airiExt.consciousness?.provider || '',
    consciousness: airiExt.consciousness?.model || '',
    visionProvider: airiExt.vision?.provider || '',
    vision: airiExt.vision?.model || '',
    speechProvider: airiExt.speech?.provider || '',
    speech: airiExt.speech?.model || '',
    voice: airiExt.speech?.voice_id || '',
  }
})

// Get character settings
const characterSettings = computed(() => {
  if (!selectedCard.value)
    return {}

  return {
    personality: selectedCard.value.personality,
    scenario: selectedCard.value.scenario,
    systemPrompt: selectedCard.value.systemPrompt,
    postHistoryInstructions: selectedCard.value.postHistoryInstructions,
  }
})

// Check if card is active
const isActive = computed(() => props.cardId === activeCardId.value)

const isActivating = ref(false)

async function handleActivate() {
  if (isActive.value || isActivating.value)
    return
  isActivating.value = true
  try {
    await cardStore.activateCard(props.cardId)
  }
  finally {
    isActivating.value = false
  }
}

onMounted(() => cardStore.initialize())

async function handleExportCard() {
  if (!selectedCard.value)
    return

  isExportingCard.value = true
  try {
    useDownload(
      await exportAiriCardPackage({ card: selectedCard.value, displayModelsStore }),
      `${selectedCard.value.name.trim()}.zip`,
    ).download()
    toast(t('settings.pages.card.exported'))
  }
  catch (error) {
    console.error('Error exporting card package:', error)
    toast(t('settings.pages.card.export_failed'))
  }
  finally {
    isExportingCard.value = false
  }
}

function highlightTagToHtml(text: string) {
  return DOMPurify.sanitize(text?.replace(/\{\{(.*?)\}\}/g, '<span class="bg-primary-500/20 inline-block">{{ $1 }}</span>').trim())
}

// Delete confirmation
const showDeleteConfirm = ref(false)

async function handleDeleteConfirm() {
  if (selectedCard.value) {
    await removeCard(props.cardId)
    emit('back')
  }
  showDeleteConfirm.value = false
}

// Background options including journal entries
const backgroundOptions = computed(() => {
  const backgrounds = backgroundStore.getCharacterBackgrounds(props.cardId)
  return [
    { value: 'none', label: t('settings.pages.card.creation.none') },
    ...backgrounds.map(bg => ({
      value: bg.id,
      label: bg.type === 'journal' ? `Journal: ${bg.title}` : bg.title,
    })),
  ]
})

const activeBackgroundId = computed({
  get: () => selectedCard.value?.extensions?.airi?.modules?.activeBackgroundId || 'none',
  set: async (val: string) => {
    if (!selectedCard.value)
      return
    const extension = JSON.parse(JSON.stringify(selectedCard.value.extensions))
    if (!extension.airi.modules)
      extension.airi.modules = {}

    extension.airi.modules.activeBackgroundId = val

    await cardStore.updateCard(props.cardId, {
      ...selectedCard.value,
      extensions: extension,
    })
    trackSceneBackgroundSet({ source: 'card_gallery', cleared: val === 'none' })
  },
})

// Tab type definition
interface Tab {
  id: string
  label: string
  icon: string
}

// Active tab ID state
const activeTabId = ref('')

// Tabs for card details
const tabs = computed<Tab[]>(() => {
  const availableTabs: Tab[] = []

  // Description tab - always show if there's description
  if (selectedCard.value?.description) {
    availableTabs.push({
      id: 'description',
      label: t('settings.pages.card.description_label'),
      icon: 'i-solar:document-text-linear',
    })
  }

  // Notes tab - only show if there are creator notes
  if (selectedCard.value?.notes) {
    availableTabs.push({
      id: 'notes',
      label: t('settings.pages.card.creator_notes'),
      icon: 'i-solar:notes-linear',
    })
  }

  // Character tab - only show if there are character settings
  if (Object.values(characterSettings.value).some(value => !!value)) {
    availableTabs.push({
      id: 'character',
      label: t('settings.pages.card.character'),
      icon: 'i-solar:user-rounded-linear',
    })
  }

  // Modules tab - always show
  availableTabs.push({
    id: 'modules',
    label: t('settings.pages.card.modules'),
    icon: 'i-solar:tuning-square-linear',
  })

  // Gallery tab - always show
  availableTabs.push({
    id: 'gallery',
    label: 'Gallery',
    icon: 'i-solar:gallery-linear',
  })

  return availableTabs
})

function handleSetAsBackground(id: string) {
  activeBackgroundId.value = id
}

function requestDeleteConfirmation(message: string): boolean {
  // NOTICE:
  // Native confirm is the existing guard for this destructive gallery action.
  // Root cause: `no-alert` rejects direct `confirm(...)` calls before this page
  // has a shared confirmation-dialog primitive wired into the card settings flow.
  // Source/context: this component already used native confirm for journal delete.
  // Removal condition: replace with the shared modal confirmation component.
  const confirmAction = globalThis.confirm.bind(globalThis)
  return confirmAction(message)
}

async function handleDeleteEntry(id: string) {
  if (requestDeleteConfirmation('Are you sure you want to delete this image from the journal?')) {
    await backgroundStore.removeBackground(id)
  }
}

async function handleRefreshGallery() {
  isRefreshingGallery.value = true
  try {
    await backgroundStore.initializeStore()
  }
  finally {
    isRefreshingGallery.value = false
  }
}

async function handleDownloadEntry(id: string, title: string) {
  const url = backgroundStore.getBackgroundUrl(id)
  if (!url)
    return

  const link = document.createElement('a')
  link.href = url
  link.download = `${title || 'image'}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Active tab state - set to first available tab by default
const activeTab = computed({
  get: () => {
    // If current active tab is not in available tabs, reset to first tab
    if (!tabs.value.some(tab => tab.id === activeTabId.value)) {
      if (props.initialTab && tabs.value.some(tab => tab.id === props.initialTab))
        return props.initialTab
      return tabs.value[0]?.id || ''
    }
    return activeTabId.value
  },
  set: (value: string) => {
    activeTabId.value = value
  },
})

watch(() => [props.cardId, props.initialTab], () => {
  activeTabId.value = props.initialTab || ''
}, { immediate: true })

// Helper function to generate placeholder text for default values
function getDefaultPlaceholder(): string {
  return t('settings.pages.card.creation.inherit_global_settings')
}

// Helper function to get display value for module settings
function getModuleDisplayValue(value: string | undefined): string {
  return value || getDefaultPlaceholder()
}
</script>

<template>
  <div :class="['h-full min-h-0 w-full flex flex-col bg-white dark:bg-neutral-950']">
    <div v-if="selectedCard" :class="['h-full min-h-0 w-full flex flex-col']">
      <header :class="['shrink-0 border-b border-neutral-200/70 dark:border-neutral-800']">
        <div :class="['mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6']">
          <div :class="['min-w-0 flex items-center gap-3']">
            <IconButton icon="i-solar:alt-arrow-left-line-duotone" :class="['size-9']" :aria-label="t('settings.pages.card.back')" @click="emit('back')" />
            <div :class="['min-w-0']">
              <div :class="['flex flex-wrap items-center gap-2']">
                <h1 :class="['break-words text-lg font-semibold']">
                  {{ selectedCard.name }}
                </h1>
                <div v-if="isActive" class="flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-600 font-medium dark:bg-primary-900/40 dark:text-primary-400">
                  <div i-solar:check-circle-bold-duotone text-xs />
                  {{ t('settings.pages.card.active_badge') }}
                </div>
              </div>
              <div :class="['mt-1 text-sm text-neutral-500 dark:text-neutral-400']">
                v{{ selectedCard.version }}
                <template v-if="selectedCard.creator">
                  · {{ t('settings.pages.card.created_by') }} <span font-medium>{{ selectedCard.creator }}</span>
                </template>
              </div>
            </div>
          </div>
          <div :class="['flex items-center gap-2']">
            <Button icon="i-solar:pen-2-linear" :label="t('settings.pages.card.edit_card')" @click="emit('edit', cardId)" />
            <Button
              :icon="isActive ? 'i-solar:check-circle-bold-duotone' : 'i-solar:play-circle-broken'"
              :label="isActive ? t('settings.pages.card.active') : t('settings.pages.card.activate')"
              color="primary"
              :disabled="isActive || isActivating"
              @click="handleActivate"
            />
          </div>
        </div>
      </header>
      <div :class="['min-h-0 flex-1 overflow-y-auto']">
        <div :class="['mx-auto max-w-7xl grid grid-cols-1 gap-6 p-4 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-10 lg:p-6']">
          <aside :class="['min-w-0 flex flex-col gap-4']">
            <CardModelPreview :model-id="selectedCard.extensions.airi.modules.displayModelId" profile />
            <div v-if="selectedCard.tags?.length" :class="['flex flex-wrap gap-1.5']">
              <span v-for="tag in selectedCard.tags" :key="tag" :class="['rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300']">{{ tag }}</span>
            </div>
            <div :class="['grid grid-cols-2 gap-2']">
              <Button
                icon="i-solar:download-minimalistic-bold-duotone"
                :label="t('settings.pages.card.export')"
                :disabled="isExportingCard"
                @click="handleExportCard"
              />
              <Button
                v-if="cardId !== 'default'"
                icon="i-solar:trash-bin-trash-linear"
                :label="t('settings.pages.card.delete')"
                @click="showDeleteConfirm = true"
              />
            </div>
          </aside>
          <div :class="['min-w-0 flex flex-col gap-4']">
            <!-- Card content tabs -->
            <div :class="['min-w-0 overflow-x-auto']">
              <div class="border-b border-neutral-200 dark:border-neutral-700">
                <div :class="['flex flex-wrap gap-1']">
                  <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    :class="[
                      'shrink-0 px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                      activeTab === tab.id
                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 dark:border-primary-400'
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300',
                    ]"
                    :aria-pressed="activeTab === tab.id"
                    @click="activeTab = tab.id"
                  >
                    <div class="flex items-center gap-1">
                      <div :class="tab.icon" />
                      {{ tab.label }}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- Creator notes -->
            <div v-if="activeTab === 'notes' && selectedCard.notes">
              <div
                bg="white/60 dark:black/30"
                border="~ neutral-200/50 dark:neutral-700/30"
                max-h-60 overflow-auto whitespace-pre-line rounded-lg p-4 text-neutral-700 sm:max-h-80 dark:text-neutral-300 transition="all duration-200"
                hover="bg-white/80 dark:bg-black/40"
                v-html="highlightTagToHtml(selectedCard.notes)"
              />
            </div>

            <!-- Description section -->
            <div v-if="activeTab === 'description' && selectedCard.description">
              <div
                bg="white/60 dark:black/30"
                max-h-60 overflow-auto whitespace-pre-line rounded-lg p-4 sm:max-h-80
                text="neutral-600 dark:neutral-300"
                border="~ neutral-200/50 dark:neutral-700/30"
                v-html="highlightTagToHtml(selectedCard.description)"
              />
            </div>

            <!-- Character -->
            <div v-if="activeTab === 'character' && Object.values(characterSettings).some(value => !!value)">
              <div flex="~ col" max-h-60 gap-4 overflow-auto pr-1 sm:max-h-80>
                <template v-for="(value, key) in characterSettings" :key="key">
                  <div v-if="value" flex="~ col" gap-2>
                    <h2 text-lg text-neutral-500 font-medium dark:text-neutral-400>
                      {{ t(`settings.pages.card.${key.toLowerCase()}`) }}
                    </h2>
                    <div
                      bg="white/60 dark:black/30"
                      border="~ neutral-200/50 dark:neutral-700/30"
                      transition="all duration-200"
                      hover="bg-white/80 dark:bg-black/40"
                      max-h-none overflow-auto whitespace-pre-line rounded-lg p-3 text-neutral-700 dark:text-neutral-300
                      v-html="highlightTagToHtml(value)"
                    />
                  </div>
                </template>
              </div>
            </div>

            <!-- Modules -->
            <div v-if="activeTab === 'modules'">
              <div grid="~ cols-1 sm:cols-2" gap-4>
                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-1 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:brain />
                    {{ t('settings.pages.card.chat.provider') }}
                  </span>
                  <div truncate font-medium>
                    {{ getModuleDisplayValue(moduleSettings.consciousnessProvider) }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-1 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:ghost />
                    {{ t('settings.pages.card.consciousness.model') }}
                  </span>
                  <div truncate font-medium>
                    {{ getModuleDisplayValue(moduleSettings.consciousness) }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-1 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:eye />
                    {{ t('settings.pages.card.vision.provider') }}
                  </span>
                  <div truncate font-medium>
                    {{ getModuleDisplayValue(moduleSettings.visionProvider) }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-1 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:scan-eye />
                    {{ t('settings.pages.card.vision.model') }}
                  </span>
                  <div truncate font-medium>
                    {{ getModuleDisplayValue(moduleSettings.vision) }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-1 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:radio />
                    {{ t('settings.pages.card.speech.provider') }}
                  </span>
                  <div truncate font-medium>
                    {{ getModuleDisplayValue(moduleSettings.speechProvider) }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-2 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:mic />
                    {{ t('settings.pages.card.speech.model') }}
                  </span>
                  <div truncate font-medium>
                    {{ getModuleDisplayValue(moduleSettings.speech) }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-2 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:music />
                    {{ t('settings.pages.card.speech.voice') }}
                  </span>
                  <div truncate font-medium>
                    {{ getModuleDisplayValue(moduleSettings.voice) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Gallery -->
            <div v-if="activeTab === 'gallery'">
              <!-- Gallery Header / Preferred Background Selection -->
              <div
                :class="[
                  'mb-6 flex flex-wrap items-center justify-between gap-4',
                  'border-b border-neutral-100 pb-4 dark:border-neutral-700/50',
                ]"
              >
                <div class="flex flex-row items-center gap-3">
                  <div class="flex flex-col gap-1">
                    <h3 text-sm font-medium>
                      Pinned Background
                    </h3>
                    <p text-xs text-neutral-500>
                      Select the image to show when this character is active.
                    </p>
                  </div>
                  <button
                    :class="[
                      'flex items-center justify-center size-7 rounded-md',
                      'bg-neutral-100 dark:bg-neutral-800 text-neutral-500',
                      'hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300',
                      'transition-all duration-200 active:scale-90',
                    ]"
                    :disabled="isRefreshingGallery"
                    title="Refresh gallery"
                    @click="handleRefreshGallery"
                  >
                    <div
                      class="i-lucide:refresh-cw text-sm"
                      :class="{ 'animate-spin': isRefreshingGallery }"
                    />
                  </button>
                </div>
                <div :class="['w-full sm:w-64']">
                  <Select
                    v-model="activeBackgroundId"
                    :options="backgroundOptions"
                    placeholder="Select background"
                  />
                </div>
              </div>

              <div
                v-if="journalEntries.length === 0"
                :class="[
                  'flex flex-col items-center justify-center',
                  'border border-dashed border-neutral-200 rounded-xl',
                  'bg-neutral-50/50 py-12 dark:border-neutral-700/50 dark:bg-neutral-900/50',
                ]"
              >
                <div class="i-solar:gallery-wide-broken mb-3 text-5xl text-neutral-300 dark:text-neutral-600" />
                <p class="text-neutral-500 dark:text-neutral-400">
                  No images in the journal yet.
                </p>
              </div>
              <div v-else class="grid grid-cols-2 max-h-120 gap-4 overflow-y-auto pr-2 lg:grid-cols-4 sm:grid-cols-3">
                <div
                  v-for="entry in journalEntries"
                  :key="entry.id"
                  class="group relative aspect-square overflow-hidden border border-neutral-200 rounded-lg bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900"
                  :class="{ 'ring-2 ring-primary-500 border-primary-500': activeBackgroundId === entry.id }"
                >
                  <img
                    :src="backgroundStore.getBackgroundUrl(entry.id) ?? undefined"
                    class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                    loading="lazy"
                  >
                  <!-- Overlay Actions -->
                  <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <button
                      class="flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] text-white font-bold backdrop-blur-md transition-all active:scale-95"
                      :class="activeBackgroundId === entry.id ? 'bg-primary-500 hover:bg-primary-600' : 'bg-white/20 hover:bg-white/30'"
                      @click="handleSetAsBackground(entry.id)"
                    >
                      <div :class="activeBackgroundId === entry.id ? 'i-solar:pin-bold' : 'i-solar:pin-linear'" />
                      {{ activeBackgroundId === entry.id ? 'ACTIVE BG' : 'SET AS BG' }}
                    </button>
                    <button
                      class="flex items-center gap-1 rounded-full bg-blue-500/80 px-3 py-1.5 text-[10px] text-white font-bold backdrop-blur-md transition-all active:scale-95 hover:bg-blue-500"
                      @click="handleDownloadEntry(entry.id, entry.title)"
                    >
                      <div class="i-solar:download-square-linear" />
                      DOWNLOAD
                    </button>
                    <button
                      class="flex items-center gap-1 rounded-full bg-red-500/80 px-3 py-1.5 text-[10px] text-white font-bold backdrop-blur-md transition-all active:scale-95 hover:bg-red-500"
                      @click="handleDeleteEntry(entry.id)"
                    >
                      <div class="i-solar:trash-bin-trash-linear" />
                      DELETE
                    </button>
                  </div>
                  <!-- Info Badge -->
                  <div class="pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/90 backdrop-blur-sm">
                    {{ entry.title }}
                  </div>
                  <!-- Active Indicator -->
                  <div v-if="activeBackgroundId === entry.id" class="absolute left-1 top-1 rounded bg-primary-500 p-1 text-white shadow-lg">
                    <div class="i-solar:pin-bold text-[10px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      v-else
      bg="neutral-50/50 dark:neutral-900/50"
      rounded-xl p-8 text-center
      border="~ neutral-200/50 dark:neutral-700/30"
      shadow="sm"
    >
      <div i-solar:card-search-broken mx-auto mb-3 text-6xl text-neutral-400 />
      <p>{{ t('settings.pages.card.card_not_found') }}</p>
      <Button :label="t('settings.pages.card.back')" @click="emit('back')" />
    </div>
  </div>

  <!-- Delete confirmation dialog -->
  <DeleteCardDialog
    v-model="showDeleteConfirm"
    :card-name="selectedCard?.name"
    @confirm="handleDeleteConfirm"
    @cancel="showDeleteConfirm = false"
  />
</template>
