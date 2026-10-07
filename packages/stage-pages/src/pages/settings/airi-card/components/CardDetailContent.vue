<script setup lang="ts">
import type { DocumentHistoryEntry } from '@proj-airi/stage-ui/libs/document-sync/client'
import type { BackgroundEntry } from '@proj-airi/stage-ui/stores/background'
import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import DOMPurify from 'dompurify'

import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useDownload } from '@proj-airi/stage-ui/composables/download'
import { exportAiriCardPackage } from '@proj-airi/stage-ui/services/airi-card-import-export'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Avatar, Button, GhostButton, IconButton, Select } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { DialogTitle } from 'reka-ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { formatRelativeTime } from '../composables/relative-time'

interface Props {
  cardId: string
  initialTab?: string
  /**
   * The dialog variant renders the card name as the accessible DialogTitle.
   * The drawer variant omits it because BottomDrawer already renders the name.
   */
  variant: 'dialog' | 'drawer'
  /** Revision whose restore is in flight; its restore button stays disabled. */
  restoringRevision: number | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'requestRestore', entry: DocumentHistoryEntry): void
  (e: 'requestDelete'): void
}>()

const { t, te, locale } = useI18n()
const { trackSceneBackgroundSet } = useAnalytics()
const cardStore = useAiriCardStore()
const backgroundStore = useBackgroundStore()
const displayModelsStore = useDisplayModelsStore()

const { activeCardId, cardSyncStates, cloudSyncEnabled } = storeToRefs(cardStore)
const { isAuthenticated } = storeToRefs(useAuthStore())

const isRefreshingGallery = ref(false)
const isExportingCard = shallowRef(false)

// Get selected card data
const selectedCard = computed<AiriCard | undefined>(() => {
  if (!props.cardId)
    return undefined
  return cardStore.getCard(props.cardId)
})

// Preview of the display model the card points at, same lookup as the
// character switcher. Undefined renders the rail's fallback icon.
const previewImage = computed(() => {
  const displayModelId = selectedCard.value?.extensions?.airi?.modules?.displayModelId
  return displayModelsStore.displayModels.find(model => model.id === displayModelId)?.previewImage
})

// Upload state of this card; absent when the user is not signed in.
const syncState = computed(() => cardSyncStates.value[props.cardId])

const syncIcons = {
  synced: 'i-solar:cloud-check-outline',
  pending: 'i-solar:cloud-upload-outline',
  refused: 'i-solar:cloud-cross-outline',
} as const

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

// Animation control for card activation
const isActivating = ref(false)

function handleActivate() {
  isActivating.value = true
  setTimeout(async () => {
    await cardStore.activateCard(props.cardId)
    isActivating.value = false
  }, 300)
}

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

  // History tab - only for a signed-in user with cloud sync on, who has cloud history to show
  if (isAuthenticated.value && cloudSyncEnabled.value) {
    availableTabs.push({
      id: 'history',
      label: t('settings.pages.card.sync.history.tab'),
      icon: 'i-solar:history-linear',
    })
  }

  return availableTabs
})

async function handleSetAsBackground(entry: Pick<BackgroundEntry, 'id'>) {
  activeBackgroundId.value = entry.id
}

function requestDeleteConfirmation(message: string): boolean {
  // NOTICE:
  // Native confirm guards this destructive gallery action.
  // Root cause: `no-alert` rejects direct `confirm(...)` calls, and this page
  // has no shared confirmation-dialog primitive wired into the card flow.
  // Source/context: the pre-refactor detail dialog used the same guard.
  // Removal condition: replace with the shared modal confirmation component.
  const confirmAction = globalThis.confirm.bind(globalThis)
  return confirmAction(message)
}

const historyEntries = ref<DocumentHistoryEntry[]>([])
const isLoadingHistory = ref(false)
const historyLoadFailed = ref(false)

function formatHistoryDate(at: string) {
  return new Date(at).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatHistoryRelative(at: string) {
  return formatRelativeTime(at, locale.value)
}

// A field key is an RFC 6901 pointer such as `/name`. The label comes from
// the last segment, with the raw segment as the fallback for unknown fields.
function historyFieldLabel(pointer: string) {
  const segment = pointer.split('/').pop() || pointer
  const key = `settings.pages.card.sync.history.fields.${segment}`
  return te(key) ? t(key) : segment
}

async function loadHistory() {
  if (!props.cardId)
    return

  isLoadingHistory.value = true
  historyLoadFailed.value = false
  try {
    const history = await cardStore.cardHistory(props.cardId, { limit: 50 })
    historyEntries.value = history ?? []
  }
  catch (error) {
    console.error('Error loading card history:', error)
    historyLoadFailed.value = true
  }
  finally {
    isLoadingHistory.value = false
  }
}

// The container owns the restore dialog: on mobile the drawer closes before
// the dialog can open, so the confirm flow cannot live in this component.
defineExpose({ reloadHistory: loadHistory })

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

watch(activeTab, (tab) => {
  if (tab === 'history')
    void loadHistory()
})

// The container unmounts this component when it closes, so open-time reset
// and close-time cleanup of the history state happen with the lifecycle.
watch(() => props.initialTab, (tab) => {
  if (tab && tabs.value.some(item => item.id === tab))
    activeTabId.value = tab
}, { immediate: true })

// Helper function to generate placeholder text for default values
function getDefaultPlaceholder(): string {
  return t('settings.pages.card.creation.inherit_global_settings')
}

// Helper function to get display value for module settings
function getModuleDisplayValue(value: string | undefined): string {
  return value || getDefaultPlaceholder()
}

const actionIconClasses = [
  'size-9 rounded-lg',
  'text-neutral-500 dark:text-neutral-400',
  'hover:bg-neutral-200/60 dark:hover:bg-neutral-700/50',
  'focus-visible:outline-2 focus-visible:outline-primary-500 dark:focus-visible:outline-primary-400',
]

// Scrollable reading surface shared by the notes, description, and character panes.
const readingPaneClasses = [
  'max-h-60 overflow-auto whitespace-pre-line rounded-lg p-4 sm:max-h-80',
  'bg-white/60 dark:bg-black/30',
  'border border-neutral-200/50 dark:border-neutral-700/30',
  'text-neutral-700 dark:text-neutral-300',
  'transition-all duration-200',
  'hover:bg-white/80 dark:hover:bg-black/40',
]

const moduleCardClasses = [
  'flex flex-col gap-1 rounded-lg p-3',
  'bg-white/60 dark:bg-black/30',
  'border border-neutral-200/50 dark:border-neutral-700/30',
  'transition-all duration-200',
  'hover:bg-white/80 dark:hover:bg-black/40',
]

const moduleLabelClasses = [
  'flex items-center gap-2',
  'text-sm text-neutral-500 dark:text-neutral-400',
]
</script>

<template>
  <div
    v-if="selectedCard"
    :class="[
      'w-full flex flex-col gap-5',
      variant === 'dialog' ? 'md:flex-row md:gap-6' : '',
    ]"
  >
    <!-- Rail: preview, identity, and actions. The dialog keeps it on the
         left; the drawer stacks the same blocks above the tabs. -->
    <div :class="['flex shrink-0 flex-col gap-3', variant === 'dialog' ? 'md:w-64' : '']">
      <Avatar
        :src="previewImage"
        :alt="selectedCard.name"
        :class="[
          'aspect-[4/3] w-full rounded-xl',
          'bg-neutral-100 text-neutral-400 dark:bg-neutral-800',
        ]"
      >
        <template #fallback>
          <span aria-hidden="true" :class="['i-solar:user-rounded-outline size-10']" />
        </template>
      </Avatar>

      <div :class="['min-w-0 flex flex-col gap-1']">
        <div :class="['flex items-center gap-2']">
          <DialogTitle
            v-if="variant === 'dialog'"
            :class="[
              'truncate text-2xl font-normal',
              'bg-gradient-to-r from-primary-500 to-primary-400 bg-clip-text text-transparent',
            ]"
          >
            {{ selectedCard.name }}
          </DialogTitle>
          <div v-else :class="['truncate text-xl font-normal']">
            {{ selectedCard.name }}
          </div>
          <span
            v-if="isActive"
            :class="[
              'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5',
              'text-xs font-medium',
              'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400',
            ]"
          >
            <span :class="['i-solar:check-circle-bold-duotone text-xs']" />
            {{ t('settings.pages.card.active_badge') }}
          </span>
        </div>
        <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          v{{ selectedCard.version }}
          <template v-if="selectedCard.creator">
            · {{ t('settings.pages.card.created_by') }} <span :class="['font-medium']">{{ selectedCard.creator }}</span>
          </template>
        </div>
      </div>

      <Button
        block
        :icon="isActive ? 'i-solar:check-circle-bold-duotone' : 'i-solar:play-circle-broken'"
        :label="isActive ? t('settings.pages.card.active') : t('settings.pages.card.activate')"
        :disabled="isActive"
        :class="{ 'animate-pulse': isActivating }"
        @click="handleActivate"
      />

      <div :class="['flex items-center gap-1']">
        <IconButton
          icon="i-solar:download-minimalistic-bold-duotone"
          :aria-label="t('settings.pages.card.export')"
          :title="t('settings.pages.card.export')"
          :disabled="isExportingCard"
          :class="actionIconClasses"
          @click="handleExportCard"
        />
        <IconButton
          v-if="cardId !== 'default'"
          icon="i-solar:trash-bin-trash-linear"
          :aria-label="t('settings.pages.card.delete')"
          :title="t('settings.pages.card.delete')"
          :class="actionIconClasses"
          @click="emit('requestDelete')"
        />
        <IconButton
          icon="i-solar:close-circle-bold-duotone"
          :aria-label="t('settings.pages.card.close')"
          :title="t('settings.pages.card.close')"
          :class="actionIconClasses"
          @click="emit('close')"
        />
      </div>

      <div
        v-if="syncState"
        :class="[
          'flex items-center gap-1.5 text-xs',
          syncState === 'refused' ? 'text-amber-500' : 'text-neutral-500 dark:text-neutral-400',
        ]"
      >
        <span :class="syncIcons[syncState]" />
        {{ t(`settings.pages.card.sync.state.${syncState}`) }}
      </div>
    </div>

    <!-- Tabs and panels -->
    <div :class="['min-w-0 flex flex-1 flex-col gap-5']">
      <!-- Tabs stay on one row; the row scrolls sideways on narrow screens. -->
      <div :class="['border-b border-neutral-200 dark:border-neutral-700']">
        <div :class="['flex gap-1 overflow-x-auto whitespace-nowrap -mb-px']">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="[
              'shrink-0 px-3 py-2',
              'text-sm font-medium',
              activeTab === tab.id
                ? 'border-b-2 border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300',
            ]"
            @click="activeTab = tab.id"
          >
            <span :class="['flex items-center gap-1.5']">
              <span :class="tab.icon" />
              {{ tab.label }}
            </span>
          </button>
        </div>
      </div>

      <!-- Creator notes -->
      <div v-if="activeTab === 'notes' && selectedCard.notes">
        <div
          :class="readingPaneClasses"
          v-html="highlightTagToHtml(selectedCard.notes)"
        />
      </div>

      <!-- Description section -->
      <div v-if="activeTab === 'description' && selectedCard.description">
        <div
          :class="readingPaneClasses"
          v-html="highlightTagToHtml(selectedCard.description)"
        />
      </div>

      <!-- Character -->
      <div v-if="activeTab === 'character' && Object.values(characterSettings).some(value => !!value)">
        <div :class="['flex flex-col gap-4', 'max-h-60 overflow-auto pr-1 sm:max-h-80']">
          <template v-for="(value, key) in characterSettings" :key="key">
            <div v-if="value" :class="['flex flex-col gap-2']">
              <h2 :class="['text-lg font-medium text-neutral-500 dark:text-neutral-400']">
                {{ t(`settings.pages.card.${key.toLowerCase()}`) }}
              </h2>
              <div
                :class="[...readingPaneClasses, 'max-h-none p-3']"
                v-html="highlightTagToHtml(value)"
              />
            </div>
          </template>
        </div>
      </div>

      <!-- Modules -->
      <div v-if="activeTab === 'modules'">
        <div :class="['grid grid-cols-1 gap-4 sm:grid-cols-2']">
          <div :class="moduleCardClasses">
            <span :class="moduleLabelClasses">
              <div i-lucide:brain />
              {{ t('settings.pages.card.chat.provider') }}
            </span>
            <div :class="['truncate font-medium']">
              {{ getModuleDisplayValue(moduleSettings.consciousnessProvider) }}
            </div>
          </div>

          <div :class="moduleCardClasses">
            <span :class="moduleLabelClasses">
              <div i-lucide:ghost />
              {{ t('settings.pages.card.consciousness.model') }}
            </span>
            <div :class="['truncate font-medium']">
              {{ getModuleDisplayValue(moduleSettings.consciousness) }}
            </div>
          </div>

          <div :class="moduleCardClasses">
            <span :class="moduleLabelClasses">
              <div i-lucide:eye />
              {{ t('settings.pages.card.vision.provider') }}
            </span>
            <div :class="['truncate font-medium']">
              {{ getModuleDisplayValue(moduleSettings.visionProvider) }}
            </div>
          </div>

          <div :class="moduleCardClasses">
            <span :class="moduleLabelClasses">
              <div i-lucide:scan-eye />
              {{ t('settings.pages.card.vision.model') }}
            </span>
            <div :class="['truncate font-medium']">
              {{ getModuleDisplayValue(moduleSettings.vision) }}
            </div>
          </div>

          <div :class="moduleCardClasses">
            <span :class="moduleLabelClasses">
              <div i-lucide:radio />
              {{ t('settings.pages.card.speech.provider') }}
            </span>
            <div :class="['truncate font-medium']">
              {{ getModuleDisplayValue(moduleSettings.speechProvider) }}
            </div>
          </div>

          <div :class="moduleCardClasses">
            <span :class="moduleLabelClasses">
              <div i-lucide:mic />
              {{ t('settings.pages.card.speech.model') }}
            </span>
            <div :class="['truncate font-medium']">
              {{ getModuleDisplayValue(moduleSettings.speech) }}
            </div>
          </div>

          <div :class="moduleCardClasses">
            <span :class="moduleLabelClasses">
              <div i-lucide:music />
              {{ t('settings.pages.card.speech.voice') }}
            </span>
            <div :class="['truncate font-medium']">
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
            'mb-6 flex flex-col gap-3',
            'border-b border-neutral-100 pb-4 dark:border-neutral-700/50',
            'sm:flex-row sm:items-center sm:justify-between sm:gap-4',
          ]"
        >
          <div :class="['flex flex-row items-center gap-3']">
            <div :class="['flex flex-col gap-1']">
              <h3 :class="['text-sm font-medium']">
                Pinned Background
              </h3>
              <p :class="['text-xs text-neutral-500']">
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
              aria-label="Refresh gallery"
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
          <div :class="['i-solar:gallery-wide-broken mb-3 text-5xl text-neutral-300 dark:text-neutral-600']" />
          <p :class="['text-neutral-500 dark:text-neutral-400']">
            No images in the journal yet.
          </p>
        </div>
        <div v-else :class="['grid grid-cols-2 max-h-120 gap-4 overflow-y-auto pr-2 sm:grid-cols-3 lg:grid-cols-4']">
          <div
            v-for="entry in journalEntries"
            :key="entry.id"
            :class="[
              'group relative aspect-square overflow-hidden rounded-lg',
              'border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900',
              activeBackgroundId === entry.id ? 'ring-2 ring-primary-500 border-primary-500' : '',
            ]"
          >
            <img
              :src="backgroundStore.getBackgroundUrl(entry.id) ?? undefined"
              :class="[
                'h-full w-full object-cover',
                'transition-transform duration-300 group-hover:scale-110',
              ]"
              loading="lazy"
            >
            <!-- Overlay Actions -->
            <div :class="['absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100']">
              <button
                :class="[
                  'flex items-center gap-1 rounded-full px-3 py-1.5',
                  'text-[10px] text-white font-bold backdrop-blur-md transition-all active:scale-95',
                  activeBackgroundId === entry.id ? 'bg-primary-500 hover:bg-primary-600' : 'bg-white/20 hover:bg-white/30',
                ]"
                @click="handleSetAsBackground(entry)"
              >
                <div :class="activeBackgroundId === entry.id ? 'i-solar:pin-bold' : 'i-solar:pin-linear'" />
                {{ activeBackgroundId === entry.id ? 'ACTIVE BG' : 'SET AS BG' }}
              </button>
              <button
                :class="[
                  'flex items-center gap-1 rounded-full px-3 py-1.5',
                  'text-[10px] text-white font-bold backdrop-blur-md transition-all active:scale-95',
                  'bg-blue-500/80 hover:bg-blue-500',
                ]"
                @click="handleDownloadEntry(entry.id, entry.title)"
              >
                <div class="i-solar:download-square-linear" />
                DOWNLOAD
              </button>
              <button
                :class="[
                  'flex items-center gap-1 rounded-full px-3 py-1.5',
                  'text-[10px] text-white font-bold backdrop-blur-md transition-all active:scale-95',
                  'bg-red-500/80 hover:bg-red-500',
                ]"
                @click="handleDeleteEntry(entry.id)"
              >
                <div class="i-solar:trash-bin-trash-linear" />
                DELETE
              </button>
            </div>
            <!-- Info Badge -->
            <div :class="['pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white/90 backdrop-blur-sm']">
              {{ entry.title }}
            </div>
            <!-- Active Indicator -->
            <div v-if="activeBackgroundId === entry.id" :class="['absolute left-1 top-1 rounded bg-primary-500 p-1 text-white shadow-lg']">
              <div class="i-solar:pin-bold text-[10px]" />
            </div>
          </div>
        </div>
      </div>

      <!-- History -->
      <div v-if="activeTab === 'history'">
        <div v-if="isLoadingHistory" :class="['py-8 text-center text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.card.sync.history.loading') }}
        </div>
        <div v-else-if="historyLoadFailed" :class="['py-8 text-center text-sm text-red-500 dark:text-red-400']">
          {{ t('settings.pages.card.sync.history.load_failed') }}
        </div>
        <div
          v-else-if="historyEntries.length === 0"
          :class="[
            'flex flex-col items-center justify-center',
            'border border-dashed border-neutral-200 rounded-xl',
            'bg-neutral-50/50 py-12 dark:border-neutral-700/50 dark:bg-neutral-900/50',
          ]"
        >
          <div :class="['i-solar:history-linear mb-3 text-5xl text-neutral-300 dark:text-neutral-600']" />
          <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.card.sync.history.empty') }}
          </p>
        </div>
        <ol v-else :class="['flex flex-col', 'max-h-96 overflow-auto pr-1']">
          <li
            v-for="(entry, index) in historyEntries"
            :key="entry.revision"
            :class="['relative flex gap-3 pb-5 last:pb-1']"
          >
            <!-- Timeline rail -->
            <div :class="['flex flex-col items-center']">
              <div
                :class="[
                  'mt-1.5 size-2.5 shrink-0 rounded-full',
                  index === 0 ? 'bg-primary-500 dark:bg-primary-400' : 'bg-neutral-300 dark:bg-neutral-600',
                ]"
              />
              <div v-if="index < historyEntries.length - 1" :class="['mt-1 w-px flex-1 bg-neutral-200 dark:bg-neutral-700']" />
            </div>

            <div :class="['min-w-0 flex flex-1 flex-row items-start justify-between gap-3']">
              <div :class="['min-w-0 flex flex-col gap-1.5']">
                <div :class="['flex items-center gap-2']">
                  <span :class="['text-sm font-medium']" :title="formatHistoryDate(entry.at)">
                    {{ formatHistoryRelative(entry.at) }}
                  </span>
                  <span
                    v-if="index === 0"
                    :class="[
                      'flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400',
                    ]"
                  >
                    {{ t('settings.pages.card.sync.history.current') }}
                  </span>
                </div>
                <div v-if="entry.changed.length > 0" :class="['flex flex-wrap items-center gap-1.5']">
                  <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                    {{ t('settings.pages.card.sync.history.changed_label') }}
                  </span>
                  <span
                    v-for="key in entry.changed"
                    :key="key"
                    :class="[
                      'rounded-md px-1.5 py-0.5 text-xs',
                      'bg-primary-500/10 text-primary-600 dark:text-primary-400',
                    ]"
                  >
                    {{ historyFieldLabel(key) }}
                  </span>
                </div>
                <div v-if="entry.removed.length > 0" :class="['flex flex-wrap items-center gap-1.5']">
                  <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                    {{ t('settings.pages.card.sync.history.removed_label') }}
                  </span>
                  <span
                    v-for="key in entry.removed"
                    :key="key"
                    :class="[
                      'rounded-md px-1.5 py-0.5 text-xs',
                      'bg-red-500/10 text-red-600 dark:text-red-400',
                    ]"
                  >
                    {{ historyFieldLabel(key) }}
                  </span>
                </div>
              </div>
              <GhostButton
                v-if="index !== 0"
                size="sm"
                icon="i-solar:restart-line-duotone"
                :label="t('settings.pages.card.sync.history.restore')"
                :disabled="restoringRevision === entry.revision"
                @click="emit('requestRestore', entry)"
              />
            </div>
          </li>
        </ol>
      </div>
    </div>
  </div>
  <div
    v-else
    :class="[
      'rounded-xl p-8 text-center shadow-sm',
      'bg-neutral-50/50 dark:bg-neutral-900/50',
      'border border-neutral-200/50 dark:border-neutral-700/30',
    ]"
  >
    <div :class="['i-solar:card-search-broken mx-auto mb-3 text-6xl text-neutral-400']" />
    {{ t('settings.pages.card.card_not_found') }}
  </div>
</template>
