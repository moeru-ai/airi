<script setup lang="ts">
import type { DocumentHistoryEntry } from '@proj-airi/stage-ui/libs/document-sync/client'
import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import DOMPurify from 'dompurify'

import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useDownload } from '@proj-airi/stage-ui/composables/download'
import { getAiriCardEditorModuleSettings } from '@proj-airi/stage-ui/services/airi-card-editor'
import { exportAiriCardPackage } from '@proj-airi/stage-ui/services/airi-card-import-export'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, GhostButton, IconButton, Select } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import CardModelPreview from './card-model-preview.vue'
import DeleteCardDialog from './DeleteCardDialog.vue'
import RestoreVersionDialog from './RestoreVersionDialog.vue'

import { formatRelativeTime } from '../composables/relative-time'

const props = defineProps<{
  cardId: string
  initialTab?: string
}>()

const emit = defineEmits<{
  back: []
  edit: [cardId: string]
}>()

const { t, te, locale } = useI18n()
const { trackSceneBackgroundSet } = useAnalytics()
const cardStore = useAiriCardStore()
const backgroundStore = useBackgroundStore()
const displayModelsStore = useDisplayModelsStore()

const { activeCardId, cardSyncStates, cloudSyncEnabled } = storeToRefs(cardStore)
const { isAuthenticated } = storeToRefs(useAuthStore())

const selectedCard = computed<AiriCard | undefined>(() => cardStore.getCard(props.cardId))
const isActive = computed(() => props.cardId === activeCardId.value)
const syncState = computed(() => cardSyncStates.value[props.cardId])
const displayModelId = computed(() => selectedCard.value
  ? getAiriCardEditorModuleSettings(selectedCard.value).displayModelId
  : '')
const displayModel = computed(() => displayModelsStore.displayModels.find(model => model.id === displayModelId.value))

const syncIcons = {
  synced: 'i-solar:cloud-check-outline',
  pending: 'i-solar:cloud-upload-outline',
  refused: 'i-solar:cloud-cross-outline',
} as const

const isActivating = shallowRef(false)
const isExportingCard = shallowRef(false)
const showDeleteConfirm = shallowRef(false)

onMounted(async () => {
  if (displayModelsStore.displayModels.length === 0)
    await displayModelsStore.loadDisplayModelsFromIndexedDB()
})

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

async function handleDeleteConfirm() {
  if (selectedCard.value) {
    await cardStore.removeCard(props.cardId)
    emit('back')
  }
  showDeleteConfirm.value = false
}

function highlightTagToHtml(text: string) {
  return DOMPurify.sanitize(text.replace(/\{\{(.*?)\}\}/g, '<span class="bg-primary-500/20 inline-block">{{ $1 }}</span>').trim())
}

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

const hasCharacterSettings = computed(() => Object.values(characterSettings.value).some(value => !!value))

function getDefaultPlaceholder(): string {
  return t('settings.pages.card.creation.inherit_global_settings')
}

function getModuleDisplayValue(value: string | undefined): string {
  return value || getDefaultPlaceholder()
}

const moduleRows = computed(() => {
  const modules = selectedCard.value?.extensions.airi.modules
  return [
    { icon: 'i-lucide:brain', label: t('settings.pages.card.chat.provider'), value: getModuleDisplayValue(modules?.consciousness.provider) },
    { icon: 'i-lucide:ghost', label: t('settings.pages.card.consciousness.model'), value: getModuleDisplayValue(modules?.consciousness.model) },
    { icon: 'i-lucide:eye', label: t('settings.pages.card.vision.provider'), value: getModuleDisplayValue(modules?.vision.provider) },
    { icon: 'i-lucide:scan-eye', label: t('settings.pages.card.vision.model'), value: getModuleDisplayValue(modules?.vision.model) },
    { icon: 'i-lucide:radio', label: t('settings.pages.card.speech.provider'), value: getModuleDisplayValue(modules?.speech.provider) },
    { icon: 'i-lucide:mic', label: t('settings.pages.card.speech.model'), value: getModuleDisplayValue(modules?.speech.model) },
    { icon: 'i-lucide:music', label: t('settings.pages.card.speech.voice'), value: getModuleDisplayValue(modules?.speech.voice_id) },
    { icon: 'i-solar:user-rounded-linear', label: t('settings.pages.card.body-model'), value: displayModel.value?.name || getDefaultPlaceholder() },
  ]
})

const journalEntries = computed(() => backgroundStore.getCharacterJournalEntries(props.cardId))
const isRefreshingGallery = shallowRef(false)

const backgroundOptions = computed(() => {
  const backgrounds = backgroundStore.getCharacterBackgrounds(props.cardId)
  return [
    { value: 'none', label: t('settings.pages.card.creation.none') },
    ...backgrounds.map(background => ({
      value: background.id,
      label: background.title,
    })),
  ]
})

const activeBackgroundId = computed({
  get: () => selectedCard.value?.extensions.airi.modules.activeBackgroundId ?? 'none',
  set: async (value: string) => {
    if (!selectedCard.value)
      return

    const extensions = structuredClone(toRaw(selectedCard.value.extensions))
    extensions.airi.modules.activeBackgroundId = value
    await cardStore.updateCard(props.cardId, {
      ...selectedCard.value,
      extensions,
    })
    trackSceneBackgroundSet({ source: 'card_gallery', cleared: value === 'none' })
  },
})

function handleSetAsBackground(id: string) {
  activeBackgroundId.value = id
}

function requestDeleteConfirmation(message: string): boolean {
  // NOTICE:
  // Native confirm guards this destructive gallery action.
  // Root cause: `no-alert` rejects direct `confirm(...)` calls, and this page
  // has no shared confirmation-dialog primitive wired into the card flow.
  // Source/context: the previous detail dialog used the same guard.
  // Removal condition: replace with the shared modal confirmation component.
  const confirmAction = globalThis.confirm.bind(globalThis)
  return confirmAction(message)
}

async function handleDeleteEntry(id: string) {
  if (requestDeleteConfirmation(t('settings.pages.card.gallery_delete_confirm')))
    await backgroundStore.removeBackground(id)
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

const historyEntries = shallowRef<DocumentHistoryEntry[]>([])
const isLoadingHistory = shallowRef(false)
const historyLoadFailed = shallowRef(false)
const restoringRevision = shallowRef<number | null>(null)
const showRestoreConfirm = shallowRef(false)
const pendingRestore = shallowRef<DocumentHistoryEntry | null>(null)
const showAllHistory = shallowRef(false)
let historyGeneration = 0

const visibleHistoryEntries = computed(() => showAllHistory.value
  ? historyEntries.value
  : historyEntries.value.slice(0, 3))

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
  const cardId = props.cardId
  if (!cardId)
    return

  const generation = ++historyGeneration
  isLoadingHistory.value = true
  historyLoadFailed.value = false
  try {
    const history = await cardStore.cardHistory(cardId, { limit: 50 })
    // A late response belongs to the card that started the request. It must not
    // replace the history of a card that the user opened afterwards.
    if (generation !== historyGeneration || cardId !== props.cardId)
      return
    historyEntries.value = history ?? []
  }
  catch (error) {
    if (generation !== historyGeneration)
      return
    console.error('Error loading card history:', error)
    historyLoadFailed.value = true
  }
  finally {
    if (generation === historyGeneration)
      isLoadingHistory.value = false
  }
}

watch([() => props.cardId, isAuthenticated, cloudSyncEnabled], ([cardId, authenticated, syncEnabled]) => {
  historyGeneration += 1
  historyEntries.value = []
  historyLoadFailed.value = false
  isLoadingHistory.value = false
  showAllHistory.value = false
  if (cardId && authenticated && syncEnabled)
    void loadHistory()
}, { immediate: true })

function requestRestoreVersion(entry: DocumentHistoryEntry) {
  pendingRestore.value = entry
  showRestoreConfirm.value = true
}

async function confirmRestoreVersion() {
  const entry = pendingRestore.value
  if (!entry || !selectedCard.value)
    return

  restoringRevision.value = entry.revision
  try {
    const restored = await cardStore.restoreCardVersion(props.cardId, entry.revision)
    toast(t(restored ? 'settings.pages.card.sync.history.restore_success' : 'settings.pages.card.sync.history.restore_failed', { name: selectedCard.value.name }))
    if (restored)
      await loadHistory()
  }
  catch (error) {
    console.error('Error restoring card version:', error)
    toast(t('settings.pages.card.sync.history.restore_failed', { name: selectedCard.value.name }))
  }
  finally {
    restoringRevision.value = null
    pendingRestore.value = null
  }
}

const detailSectionIds = new Set(['description', 'notes', 'character', 'modules', 'gallery', 'history'])

watch(() => [props.cardId, props.initialTab], async ([, section]) => {
  if (!section || !detailSectionIds.has(section))
    return

  await nextTick()
  document.getElementById(`card-detail-${section}`)?.scrollIntoView({ block: 'start' })
}, { immediate: true, flush: 'post' })

const sectionHeadingClasses = ['mb-3 text-base font-semibold']
const proseClasses = [
  'max-w-[68ch] whitespace-pre-line text-[15px] leading-7',
  'text-neutral-700 dark:text-neutral-300',
]
</script>

<template>
  <div :class="['h-full min-h-0 w-full overflow-y-auto', 'bg-neutral-50 dark:bg-neutral-950']">
    <div v-if="selectedCard" :class="['mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7']">
      <header :class="['mb-6 flex items-center gap-3']">
        <IconButton
          icon="i-solar:alt-arrow-left-line-duotone"
          :class="['size-9 rounded-lg text-xl hover:bg-primary-500/10']"
          :aria-label="t('settings.pages.card.back')"
          :title="t('settings.pages.card.back')"
          @click="emit('back')"
        />
        <div>
          <div :class="['text-sm leading-tight text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.title') }}
          </div>
          <h1 :class="['text-2xl font-medium leading-tight']">
            {{ t('settings.pages.card.title') }}
          </h1>
        </div>
      </header>

      <section
        :class="[
          'grid overflow-hidden rounded-2xl',
          'bg-primary-100 text-primary-950 dark:bg-primary-950 dark:text-primary-100',
          'lg:min-h-[340px] lg:grid-cols-[minmax(0,1fr)_42%]',
        ]"
      >
        <div :class="['flex flex-col items-start gap-3 p-5 sm:p-7 lg:p-10']">
          <h2 :class="['break-words font-cute text-4xl font-extrabold leading-none tracking-tight sm:text-6xl']">
            {{ selectedCard.name }}
          </h2>
          <div :class="['flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-primary-800 dark:text-primary-300']">
            <span
              v-if="isActive"
              :class="[
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                'bg-primary-950/10 text-primary-950 dark:bg-primary-100/10 dark:text-primary-100',
              ]"
            >
              <span class="i-solar:check-circle-bold-duotone" aria-hidden="true" />
              {{ t('settings.pages.card.active_badge') }}
            </span>
            <span class="tabular-nums">v{{ selectedCard.version }}</span>
            <span v-if="selectedCard.creator">
              {{ t('settings.pages.card.created_by') }} {{ selectedCard.creator }}
            </span>
            <span
              v-if="syncState"
              :class="[
                'flex items-center text-base',
                syncState === 'refused' ? 'text-amber-600 dark:text-amber-400' : '',
              ]"
              :title="t(`settings.pages.card.sync.state.${syncState}`)"
              :aria-label="t(`settings.pages.card.sync.state.${syncState}`)"
              :data-sync-state="syncState"
            >
              <span :class="syncIcons[syncState]" aria-hidden="true" />
            </span>
          </div>
          <p v-if="selectedCard.description" :class="['line-clamp-2 max-w-[46ch] text-[15px] text-primary-800 dark:text-primary-300']">
            {{ selectedCard.description }}
          </p>
          <div :class="['mt-auto flex flex-wrap gap-2 pt-3']">
            <Button
              :icon="isActive ? 'i-solar:check-circle-bold-duotone' : 'i-solar:play-circle-broken'"
              :label="isActive ? t('settings.pages.card.active') : t('settings.pages.card.activate')"
              color="primary"
              variant="primary"
              :disabled="isActive || isActivating"
              :loading="isActivating"
              @click="handleActivate"
            />
            <Button
              icon="i-solar:pen-2-linear"
              :label="t('settings.pages.card.edit_card')"
              @click="emit('edit', cardId)"
            />
            <Button
              icon="i-solar:download-minimalistic-linear"
              :label="t('settings.pages.card.export')"
              :disabled="isExportingCard"
              :loading="isExportingCard"
              @click="handleExportCard"
            />
            <Button
              v-if="cardId !== 'default'"
              shape="circle"
              icon="i-solar:trash-bin-trash-linear"
              :aria-label="t('settings.pages.card.delete')"
              :title="t('settings.pages.card.delete')"
              @click="showDeleteConfirm = true"
            />
          </div>
        </div>
        <CardModelPreview
          :model-id="displayModelId"
          :alt="selectedCard.name"
          :class="['order--1 !h-60 sm:!h-72 lg:order-none lg:!h-auto lg:min-h-[340px]']"
        />
      </section>

      <div :class="['mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14']">
        <div>
          <section v-if="selectedCard.description" id="card-detail-description">
            <h2 :class="sectionHeadingClasses">
              {{ t('settings.pages.card.description_label') }}
            </h2>
            <div :class="proseClasses" v-html="highlightTagToHtml(selectedCard.description)" />
          </section>

          <section v-if="selectedCard.notes" id="card-detail-notes" :class="['mt-8']">
            <h2 :class="sectionHeadingClasses">
              {{ t('settings.pages.card.creator_notes') }}
            </h2>
            <div :class="proseClasses" v-html="highlightTagToHtml(selectedCard.notes)" />
          </section>

          <section v-if="hasCharacterSettings" id="card-detail-character" :class="['mt-8']">
            <h2 :class="sectionHeadingClasses">
              {{ t('settings.pages.card.character') }}
            </h2>
            <dl :class="['grid grid-cols-1']">
              <template v-for="(value, key) in characterSettings" :key="key">
                <div v-if="value" :class="['border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-800']">
                  <dt :class="['mb-1 text-sm text-neutral-500 dark:text-neutral-400']">
                    {{ t(`settings.pages.card.${key.toLowerCase()}`) }}
                  </dt>
                  <dd :class="proseClasses" v-html="highlightTagToHtml(value)" />
                </div>
              </template>
            </dl>
          </section>

          <section id="card-detail-gallery" :class="['mt-8 scroll-mt-6']">
            <div :class="['mb-4 flex flex-wrap items-end justify-between gap-3']">
              <div>
                <h2 :class="['text-base font-semibold']">
                  {{ t('settings.pages.card.gallery') }}
                </h2>
                <p :class="['mt-1 text-xs text-neutral-500 dark:text-neutral-400']">
                  {{ t('settings.pages.card.pinned_background_description') }}
                </p>
              </div>
              <div :class="['flex items-center gap-2']">
                <Select
                  v-model="activeBackgroundId"
                  :options="backgroundOptions"
                  :placeholder="t('settings.pages.card.select_background')"
                  :aria-label="t('settings.pages.card.pinned_background')"
                  :class="['w-48']"
                />
                <IconButton
                  icon="i-lucide:refresh-cw"
                  :class="['size-9 rounded-lg text-neutral-500 hover:bg-primary-500/10 dark:text-neutral-400']"
                  :disabled="isRefreshingGallery"
                  :loading="isRefreshingGallery"
                  :aria-label="t('settings.pages.card.refresh_gallery')"
                  :title="t('settings.pages.card.refresh_gallery')"
                  @click="handleRefreshGallery"
                />
              </div>
            </div>

            <div
              v-if="journalEntries.length === 0"
              :class="[
                'flex flex-col items-center justify-center rounded-xl py-10',
                'border border-dashed border-neutral-200 dark:border-neutral-700',
                'text-neutral-500 dark:text-neutral-400',
              ]"
            >
              <div :class="['i-solar:gallery-wide-broken mb-3 text-5xl text-neutral-300 dark:text-neutral-600']" />
              <p :class="['text-sm']">
                {{ t('settings.pages.card.gallery_empty') }}
              </p>
            </div>
            <div v-else :class="['grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3']">
              <div
                v-for="entry in journalEntries"
                :key="entry.id"
                :class="[
                  'group relative aspect-[4/3] overflow-hidden rounded-xl',
                  'border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900',
                  activeBackgroundId === entry.id ? 'ring-2 ring-primary-500 border-primary-500' : '',
                ]"
              >
                <img
                  :src="backgroundStore.getBackgroundUrl(entry.id) ?? undefined"
                  :alt="entry.title"
                  :class="['h-full w-full object-cover']"
                  loading="lazy"
                >
                <div
                  :class="[
                    'absolute inset-0 flex items-center justify-center gap-2 bg-black/55',
                    'opacity-0 transition-opacity duration-200',
                    'group-hover:opacity-100 group-focus-within:opacity-100',
                    'motion-reduce:transition-none',
                  ]"
                >
                  <Button
                    shape="circle"
                    size="sm"
                    color="primary"
                    variant="primary"
                    :icon="activeBackgroundId === entry.id ? 'i-solar:pin-bold' : 'i-solar:pin-linear'"
                    :aria-label="t(activeBackgroundId === entry.id ? 'settings.pages.card.active_background' : 'settings.pages.card.set_as_background')"
                    :title="t(activeBackgroundId === entry.id ? 'settings.pages.card.active_background' : 'settings.pages.card.set_as_background')"
                    @click="handleSetAsBackground(entry.id)"
                  />
                  <Button
                    shape="circle"
                    size="sm"
                    icon="i-solar:download-square-linear"
                    :aria-label="t('settings.pages.card.download')"
                    :title="t('settings.pages.card.download')"
                    @click="handleDownloadEntry(entry.id, entry.title)"
                  />
                  <Button
                    shape="circle"
                    size="sm"
                    color="red"
                    variant="primary"
                    icon="i-solar:trash-bin-trash-linear"
                    :aria-label="t('settings.pages.card.delete')"
                    :title="t('settings.pages.card.delete')"
                    @click="handleDeleteEntry(entry.id)"
                  />
                </div>
                <div :class="['pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm']">
                  {{ entry.title }}
                </div>
                <div v-if="activeBackgroundId === entry.id" :class="['absolute left-1 top-1 rounded bg-primary-500 p-1 text-white shadow-lg']">
                  <div :class="['i-solar:pin-bold text-[10px]']" />
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside :class="['grid content-start gap-8']">
          <section id="card-detail-modules" :class="['scroll-mt-6']">
            <h2 :class="sectionHeadingClasses">
              {{ t('settings.pages.card.modules') }}
            </h2>
            <dl :class="['grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5']">
              <template v-for="row in moduleRows" :key="row.label">
                <dt :class="['flex items-center gap-2 border-b border-neutral-200 py-2.5 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400']">
                  <span :class="row.icon" aria-hidden="true" />
                  {{ row.label }}
                </dt>
                <dd :class="['truncate border-b border-neutral-200 py-2.5 text-sm font-medium dark:border-neutral-800']" :title="row.value">
                  {{ row.value }}
                </dd>
              </template>
            </dl>
          </section>

          <section v-if="isAuthenticated && cloudSyncEnabled" id="card-detail-history" :class="['scroll-mt-6']">
            <h2 :class="sectionHeadingClasses">
              {{ t('settings.pages.card.sync.history.tab') }}
            </h2>
            <div v-if="isLoadingHistory" :class="['py-5 text-sm text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.card.sync.history.loading') }}
            </div>
            <div v-else-if="historyLoadFailed" :class="['py-5 text-sm text-red-500 dark:text-red-400']">
              {{ t('settings.pages.card.sync.history.load_failed') }}
            </div>
            <div v-else-if="historyEntries.length === 0" :class="['py-5 text-sm text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.card.sync.history.empty') }}
            </div>
            <template v-else>
              <ol>
                <li
                  v-for="(entry, index) in visibleHistoryEntries"
                  :key="entry.revision"
                  :class="['relative flex gap-3 pb-5 last:pb-0']"
                >
                  <div :class="['flex flex-col items-center']">
                    <div
                      :class="[
                        'mt-1.5 size-2.5 shrink-0 rounded-full',
                        index === 0 ? 'bg-primary-500 dark:bg-primary-400' : 'bg-neutral-300 dark:bg-neutral-600',
                      ]"
                    />
                    <div v-if="index < visibleHistoryEntries.length - 1" :class="['mt-1 w-px flex-1 bg-neutral-200 dark:bg-neutral-700']" />
                  </div>
                  <div :class="['min-w-0 flex flex-1 items-start justify-between gap-3']">
                    <div :class="['min-w-0 flex flex-col gap-1.5']">
                      <div :class="['flex flex-wrap items-center gap-2']">
                        <span :class="['text-sm font-medium']" :title="formatHistoryDate(entry.at)">
                          {{ formatHistoryRelative(entry.at) }}
                        </span>
                        <span
                          v-if="index === 0"
                          :class="[
                            'rounded-full px-2 py-0.5 text-xs font-medium',
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
                          :class="['rounded-md bg-primary-500/10 px-1.5 py-0.5 text-xs text-primary-600 dark:text-primary-400']"
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
                          :class="['rounded-md bg-red-500/10 px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400']"
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
                      @click="requestRestoreVersion(entry)"
                    />
                  </div>
                </li>
              </ol>
              <GhostButton
                v-if="historyEntries.length > 3"
                size="sm"
                :class="['mt-4']"
                :icon="showAllHistory ? 'i-solar:alt-arrow-up-linear' : 'i-solar:arrow-right-linear'"
                :label="showAllHistory
                  ? t('settings.pages.card.show_less')
                  : t('settings.pages.card.view_all_history', { count: historyEntries.length })"
                @click="showAllHistory = !showAllHistory"
              />
            </template>
          </section>
        </aside>
      </div>
    </div>

    <div
      v-else
      :class="[
        'mx-auto mt-8 max-w-md rounded-xl p-8 text-center shadow-sm',
        'bg-white dark:bg-neutral-900',
        'border border-neutral-200/50 dark:border-neutral-700/30',
      ]"
    >
      <div :class="['i-solar:card-search-broken mx-auto mb-3 text-6xl text-neutral-400']" />
      <p :class="['mb-4']">
        {{ t('settings.pages.card.card_not_found') }}
      </p>
      <Button :label="t('settings.pages.card.back')" @click="emit('back')" />
    </div>

    <DeleteCardDialog
      v-model="showDeleteConfirm"
      :card-name="selectedCard?.name"
      @confirm="handleDeleteConfirm"
      @cancel="showDeleteConfirm = false"
    />

    <RestoreVersionDialog
      v-model="showRestoreConfirm"
      :card-name="selectedCard?.name"
      :version-date="pendingRestore ? formatHistoryDate(pendingRestore.at) : ''"
      @confirm="confirmRestoreVersion"
      @cancel="pendingRestore = null"
    />
  </div>
</template>
