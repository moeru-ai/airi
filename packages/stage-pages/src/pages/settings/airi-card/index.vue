<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { getAiriCardEditorModuleSettings } from '@proj-airi/stage-ui/services/airi-card-editor'
import { AiriCardPackageError, importAiriCardPackage } from '@proj-airi/stage-ui/services/airi-card-import-export'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Input } from '@proj-airi/ui'
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import CardListItem from './components/card-list-item.vue'
import WakeWordConflictAlert from './components/wake-word-conflict-alert.vue'

import { formatRelativeTime } from './composables/relative-time'

const { t, locale } = useI18n()
const cardStore = useAiriCardStore()
const displayModelsStore = useDisplayModelsStore()
const { addCard } = cardStore
const { cards, activeCardId, cardSyncStates, cloudSyncEnabled } = storeToRefs(cardStore)
const { isAuthenticated } = storeToRefs(useAuthStore())

const route = useRoute()
const router = useRouter()

const searchQuery = shallowRef('')
const sortOption = shallowRef<'nameAsc' | 'nameDesc' | 'recent'>('nameAsc')
const inputFiles = shallowRef<File[]>([])
const uploadInput = useTemplateRef<HTMLInputElement>('uploadInput')

function handleUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  inputFiles.value = Array.from(input.files ?? [])
  input.value = ''
}

const dragDepth = shallowRef(0)
const isDraggingFile = computed(() => dragDepth.value > 0)

function isFileDrag(event: DragEvent) {
  return event.dataTransfer?.types.includes('Files') ?? false
}

function handleDragEnter(event: DragEvent) {
  if (!isFileDrag(event))
    return
  event.preventDefault()
  dragDepth.value += 1
}

function handleDragOver(event: DragEvent) {
  if (isFileDrag(event))
    event.preventDefault()
}

function handleDragLeave(event: DragEvent) {
  if (!isFileDrag(event))
    return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function handleDrop(event: DragEvent) {
  if (!isFileDrag(event))
    return
  event.preventDefault()
  dragDepth.value = 0
  inputFiles.value = Array.from(event.dataTransfer?.files ?? [])
}

interface CardItem {
  id: string
  name: string
  description?: string
  version: string
  displayModelId?: string
}

watch(inputFiles, async (newFiles) => {
  const file = newFiles[0]
  if (!file)
    return

  try {
    await addCard(await importAiriCardPackage({ file, displayModelsStore }), 'import')
    toast(t('settings.pages.card.imported'))
  }
  catch (error) {
    console.error('Error processing card package:', error)
    toast(t(error instanceof AiriCardPackageError && error.code === 'missing-file'
      ? 'settings.pages.card.import_missing_file'
      : 'settings.pages.card.import_invalid_file'))
  }
  finally {
    inputFiles.value = []
  }
})

const cardsArray = computed<CardItem[]>(() =>
  Array.from(cards.value.entries()).map(([id, card]) => ({
    id,
    name: card.name,
    description: card.description,
    version: card.version,
    displayModelId: getAiriCardEditorModuleSettings(card).displayModelId || undefined,
  })),
)

const filteredCards = computed<CardItem[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase(locale.value)
  if (!query)
    return cardsArray.value

  return cardsArray.value.filter(item =>
    item.name.toLocaleLowerCase(locale.value).includes(query)
    || item.description?.toLocaleLowerCase(locale.value).includes(query),
  )
})

const sortedFilteredCards = computed<CardItem[]>(() => {
  const sorted = [...filteredCards.value]

  if (sortOption.value === 'nameAsc')
    return sorted.sort((a, b) => a.name.localeCompare(b.name))

  if (sortOption.value === 'nameDesc')
    return sorted.sort((a, b) => b.name.localeCompare(a.name))

  // The persisted Map retains insertion order. Random IDs cannot represent creation time.
  return sorted.reverse()
})

function handleCardCreation() {
  void router.push('/settings/airi-card/new')
}

watch(activeCardId, (cardId, previousCardId) => {
  if (!previousCardId || cardId === previousCardId)
    return

  const activeCard = cards.value.get(cardId)
  if (activeCard)
    toast(t('settings.pages.card.activation_notice', { name: activeCard.name }))
})

watch(() => [route.query.cardId, route.query.tab], ([cardId, tab]) => {
  if (typeof cardId !== 'string' || !cards.value.has(cardId))
    return

  const section = typeof tab === 'string' ? tab : ''
  const edit = ['identity', 'behavior', 'modules', 'artistry', 'settings'].includes(section)
  void router.replace({
    path: `/settings/airi-card/${encodeURIComponent(cardId)}${edit ? '/edit' : ''}`,
    query: edit ? { section } : { tab: section },
  })
}, { immediate: true })

interface DeletedCard {
  id: string
  name: string
  deletedAt: string
}

const showDeletedPanel = shallowRef(false)
const deletedCardsList = shallowRef<DeletedCard[]>([])
const isLoadingDeleted = shallowRef(false)
const deletedLoadFailed = shallowRef(false)
const restoringDeletedId = shallowRef<string | null>(null)

// The server keeps the content of a deleted card for 30 days.
const DELETED_CARD_RETENTION_DAYS = 30

function formatDeletedRelative(deletedAt: string) {
  return formatRelativeTime(deletedAt, locale.value)
}

function restorableDays(deletedAt: string) {
  const elapsed = Math.floor((Date.now() - new Date(deletedAt).getTime()) / (24 * 60 * 60 * 1000))
  return Math.max(0, DELETED_CARD_RETENTION_DAYS - elapsed)
}

async function loadDeletedCards() {
  isLoadingDeleted.value = true
  deletedLoadFailed.value = false
  try {
    deletedCardsList.value = await cardStore.deletedCards()
  }
  catch (error) {
    console.error('Error loading recently deleted cards:', error)
    deletedLoadFailed.value = true
  }
  finally {
    isLoadingDeleted.value = false
  }
}

async function toggleDeletedPanel() {
  showDeletedPanel.value = !showDeletedPanel.value
  if (showDeletedPanel.value)
    await loadDeletedCards()
}

async function handleRestoreDeletedCard(card: DeletedCard) {
  restoringDeletedId.value = card.id
  try {
    const restored = await cardStore.restoreDeletedCard(card.id)
    toast(t(restored ? 'settings.pages.card.sync.deleted.restore_success' : 'settings.pages.card.sync.deleted.restore_failed', { name: card.name }))
    if (restored)
      await loadDeletedCards()
  }
  catch (error) {
    console.error('Error restoring a deleted card:', error)
    toast(t('settings.pages.card.sync.deleted.restore_failed', { name: card.name }))
  }
  finally {
    restoringDeletedId.value = null
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6 rounded-xl p-4 sm:p-6']">
    <WakeWordConflictAlert />

    <div
      v-if="isAuthenticated && cloudSyncEnabled"
      :class="[
        'flex flex-col gap-3 rounded-xl px-4 py-3',
        'border border-primary-200/60 dark:border-primary-800/40',
        'bg-primary-50/50 dark:bg-primary-950/30',
      ]"
    >
      <div :class="['flex flex-row flex-wrap items-center justify-between gap-2']">
        <p :class="['flex items-center gap-2 text-sm', 'text-neutral-600 dark:text-neutral-300']">
          <span :class="['i-solar:cloud-check-outline shrink-0', 'text-primary-500 dark:text-primary-400']" />
          {{ t('settings.pages.card.sync.notice') }}
        </p>
        <button
          type="button"
          :class="[
            'flex shrink-0 items-center gap-1 text-sm',
            'text-primary-600 dark:text-primary-400',
            'hover:underline',
          ]"
          @click="toggleDeletedPanel"
        >
          <span class="i-solar:trash-bin-minimalistic-linear" />
          {{ t('settings.pages.card.sync.deleted.title') }}
          <span :class="showDeletedPanel ? 'i-solar:alt-arrow-up-linear' : 'i-solar:alt-arrow-down-linear'" />
        </button>
      </div>

      <div
        v-if="showDeletedPanel"
        :class="[
          'flex flex-col gap-2 rounded-lg p-3',
          'bg-white/60 dark:bg-black/30',
          'border border-neutral-200/50 dark:border-neutral-700/30',
        ]"
      >
        <div v-if="isLoadingDeleted" :class="['py-4 text-center text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.card.sync.deleted.loading') }}
        </div>
        <div v-else-if="deletedLoadFailed" :class="['py-4 text-center text-sm', 'text-red-500 dark:text-red-400']">
          {{ t('settings.pages.card.sync.deleted.load_failed') }}
        </div>
        <div v-else-if="deletedCardsList.length === 0" :class="['py-4 text-center text-sm', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.card.sync.deleted.empty') }}
        </div>
        <div
          v-for="card in deletedCardsList"
          :key="card.id"
          :class="[
            'flex flex-row items-center justify-between gap-3 rounded-lg p-3',
            'bg-white dark:bg-neutral-900',
            'border border-neutral-200/50 dark:border-neutral-700/30',
          ]"
        >
          <div :class="['flex min-w-0 flex-col gap-0.5']">
            <span :class="['truncate text-sm font-medium']">{{ card.name }}</span>
            <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']" :title="new Date(card.deletedAt).toLocaleString(locale)">
              {{ t('settings.pages.card.sync.deleted.deleted_when', { when: formatDeletedRelative(card.deletedAt) }) }}
              ·
              {{ t('settings.pages.card.sync.deleted.days_left', { days: restorableDays(card.deletedAt) }) }}
            </span>
          </div>
          <Button
            size="sm"
            :class="['shrink-0']"
            icon="i-solar:restart-line-duotone"
            :label="t('settings.pages.card.sync.deleted.restore')"
            :disabled="restoringDeletedId === card.id"
            @click="handleRestoreDeletedCard(card)"
          />
        </div>
      </div>
    </div>

    <p v-else-if="isAuthenticated" :class="['flex flex-wrap items-center gap-2 text-sm', 'text-neutral-500 dark:text-neutral-400']">
      <span :class="['i-solar:cloud-cross-outline shrink-0']" />
      {{ t('settings.pages.card.sync.off_notice') }}
      <RouterLink to="/settings/system/experimental" :class="['text-primary-600 dark:text-primary-400 hover:underline']">
        {{ t('settings.pages.card.sync.off_notice_link') }}
      </RouterLink>
    </p>

    <div :class="['flex flex-wrap items-center gap-3']">
      <Input
        v-model="searchQuery"
        type="search"
        :placeholder="t('settings.pages.card.search')"
        :aria-label="t('settings.pages.card.search')"
        :class="['w-full flex-1 sm:max-w-xs']"
      />
      <div :class="['w-full shrink-0 sm:w-40']">
        <ComboboxSelect
          v-model="sortOption"
          :options="[
            { value: 'nameAsc', label: t('settings.pages.card.name_asc') },
            { value: 'nameDesc', label: t('settings.pages.card.name_desc') },
            { value: 'recent', label: t('settings.pages.card.recent') },
          ]"
          :placeholder="t('settings.pages.card.sort_by')"
          :aria-label="t('settings.pages.card.sort_by')"
          :class="['w-full']"
        />
      </div>
      <div :class="['ms-auto flex flex-wrap justify-end gap-2 max-sm:w-full']">
        <Button
          icon="i-solar:upload-square-line-duotone"
          :label="t('settings.pages.card.upload')"
          @click="uploadInput?.click()"
        />
        <Button
          variant="primary"
          color="primary"
          icon="i-solar:add-square-line-duotone"
          :label="t('settings.pages.card.create_card')"
          @click="handleCardCreation"
        />
      </div>
      <input
        ref="uploadInput"
        type="file"
        accept=".zip"
        :class="['hidden']"
        @change="handleUploadChange"
      >
    </div>

    <div
      :class="['relative']"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div :class="['grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5']">
        <CardListItem
          v-for="item in sortedFilteredCards"
          :id="item.id"
          :key="item.id"
          :name="item.name"
          :is-active="item.id === activeCardId"
          :version="item.version"
          :model-id="item.displayModelId"
          :sync-state="cardSyncStates[item.id]"
        />

        <button
          type="button"
          :class="[
            'group grid content-start gap-2.5 text-left',
            'rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-400',
          ]"
          @click="handleCardCreation"
        >
          <div
            :class="[
              'flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center',
              'border-2 border-dashed border-neutral-200 dark:border-neutral-700',
              'text-neutral-500 dark:text-neutral-400',
              'transition-colors duration-200 group-hover:border-primary-400 group-hover:text-primary-600 dark:group-hover:text-primary-300',
            ]"
          >
            <span :class="['i-solar:add-square-linear text-4xl text-primary-500 dark:text-primary-400']" />
            <span :class="['font-cute text-lg font-extrabold text-neutral-800 dark:text-neutral-100']">
              {{ t('settings.pages.card.create_card') }}
            </span>
            <span :class="['text-xs']">{{ t('settings.pages.card.create_drop_hint') }}</span>
          </div>
        </button>

        <div
          v-if="cards.size === 0"
          :class="[
            'col-span-full rounded-xl p-8 text-center',
            'border border-neutral-200/50 dark:border-neutral-700/30',
            'bg-neutral-50/50 dark:bg-neutral-900/50',
          ]"
        >
          <div :class="['i-solar:card-search-broken mx-auto mb-3 text-6xl text-neutral-400']" />
          <p>{{ t('settings.pages.card.no_cards') }}</p>
        </div>

        <Alert v-if="searchQuery && sortedFilteredCards.length === 0" type="warning" :class="['col-span-full']">
          <template #title>
            {{ t('settings.pages.card.no_results') }}
          </template>
          <template #content>
            {{ t('settings.pages.card.try_different_search') }}
          </template>
        </Alert>
      </div>

      <div
        v-if="isDraggingFile"
        :class="[
          'pointer-events-none absolute inset-0 z-10',
          'flex flex-col items-center justify-center gap-2 rounded-xl',
          'border-2 border-dashed border-primary-400 dark:border-primary-500',
          'bg-primary-500/10 dark:bg-primary-400/10',
        ]"
      >
        <div :class="['i-solar:upload-minimalistic-bold text-4xl text-primary-500 dark:text-primary-400']" />
        <p :class="['text-sm font-medium text-primary-600 dark:text-primary-300']">
          {{ t('settings.pages.card.drop_here') }}
        </p>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.card.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.card.description
  icon: i-solar:emoji-funny-square-bold-duotone
  settingsEntry: true
  order: 1
  stageTransition:
    name: slide
</route>
