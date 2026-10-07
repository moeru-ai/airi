<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { AiriCardPackageError, importAiriCardPackage } from '@proj-airi/stage-ui/services/airi-card-import-export'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Callout, Input } from '@proj-airi/ui'
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import CardListItem from './components/CardListItem.vue'

import { formatRelativeTime } from './composables/relative-time'

const { t, locale } = useI18n()
const cardStore = useAiriCardStore()
const displayModelsStore = useDisplayModelsStore()
const { addCard } = cardStore
const { cards, activeCardId, cardSyncStates, cloudSyncEnabled } = storeToRefs(cardStore)
const { isAuthenticated } = storeToRefs(useAuthStore())

const route = useRoute()
const router = useRouter()

// Search query
const searchQuery = ref('')

// Sort option
const sortOption = ref<'nameAsc' | 'nameDesc' | 'recent'>('nameAsc')

const inputFiles = ref<File[]>([])

// The toolbar Upload button opens this hidden native picker. The value resets
// after each selection so picking the same file twice still triggers a change.
const uploadInput = ref<HTMLInputElement>()

function handleUploadChange(event: Event) {
  const input = event.target as HTMLInputElement
  inputFiles.value = Array.from(input.files ?? [])
  input.value = ''
}

// The card grid doubles as the drop zone. Nested cards fire their own
// dragenter/dragleave pairs, so a depth counter keeps the overlay stable.
const dragDepth = ref(0)
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
  // preventDefault marks the zone as a valid drop target.
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

// Card list data structure
interface CardItem {
  id: string
  name: string
  description?: string
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

// Transform cards Map to array for display
const cardsArray = computed<CardItem[]>(() =>
  Array.from(cards.value.entries()).map(([id, card]) => ({
    id,
    name: card.name,
    description: card.description,
    displayModelId: card.extensions?.airi?.modules?.displayModelId,
  })),
)

// Filtered cards based on search query
const filteredCards = computed<CardItem[]>(() => {
  if (!searchQuery.value)
    return cardsArray.value

  const query = searchQuery.value.toLowerCase()
  return cardsArray.value.filter(item =>
    item.name.toLowerCase().includes(query)
    || (item.description && item.description.toLowerCase().includes(query)),
  )
})

// Sorted filtered cards based on sort option
const sortedFilteredCards = computed<CardItem[]>(() => {
  const sorted = [...filteredCards.value]

  if (sortOption.value === 'nameAsc')
    return sorted.sort((a, b) => a.name.localeCompare(b.name))

  if (sortOption.value === 'nameDesc')
    return sorted.sort((a, b) => b.name.localeCompare(a.name))

  // The persisted Map retains insertion order; nanoids are random and cannot
  // represent when a card was added.
  return sorted.reverse()
})

function handleCardCreationDialog() {
  void router.push('/settings/airi-card/new')
}

watch(activeCardId, (cardId, previousCardId) => {
  if (!previousCardId || cardId === previousCardId)
    return

  const activeCard = cards.value.get(cardId)
  if (activeCard)
    toast(t('settings.pages.card.activation_notice', { name: activeCard.name }))
})

// Legacy deep links pointed at the list page with query params; send them to
// the standalone detail or edit route instead.
watch(() => [route.query.cardId, route.query.tab], ([cardId, tab]) => {
  if (typeof cardId !== 'string')
    return
  const section = typeof tab === 'string' ? tab : ''
  const edit = ['identity', 'behavior', 'model', 'modules', 'artistry', 'settings'].includes(section)
  void router.replace({
    path: `/settings/airi-card/${encodeURIComponent(cardId)}${edit ? '/edit' : ''}`,
    query: edit ? { section } : { tab: section },
  })
}, { immediate: true })

// Card version number
function getVersionNumber(id: string) {
  const card = cards.value.get(id)
  return card?.version || '1.0.0'
}

// Recently deleted cards
interface DeletedCard {
  id: string
  name: string
  deletedAt: string
}

const showDeletedPanel = ref(false)
const deletedCardsList = ref<DeletedCard[]>([])
const isLoadingDeleted = ref(false)
const deletedLoadFailed = ref(false)
const restoringDeletedId = ref<string | null>(null)

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
  <div :class="['rounded-xl p-4', 'flex flex-col gap-4']">
    <!-- Disclosure: signed-in users upload their cards -->
    <Callout
      v-if="isAuthenticated && cloudSyncEnabled"
      theme="primary"
      :label="t('settings.pages.card.sync.title')"
    >
      <div :class="['flex flex-col gap-2']">
        <div :class="['flex flex-row flex-wrap items-center justify-between gap-2']">
          <p :class="['text-sm']">
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
            <div i-solar:trash-bin-minimalistic-linear />
            {{ t('settings.pages.card.sync.deleted.title') }}
            <div :class="showDeletedPanel ? 'i-solar:alt-arrow-up-linear' : 'i-solar:alt-arrow-down-linear'" />
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
          <div v-if="isLoadingDeleted" class="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.card.sync.deleted.loading') }}
          </div>
          <div v-else-if="deletedLoadFailed" class="py-4 text-center text-sm text-red-500 dark:text-red-400">
            {{ t('settings.pages.card.sync.deleted.load_failed') }}
          </div>
          <div v-else-if="deletedCardsList.length === 0" class="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
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
              shrink-0
              icon="i-solar:restart-line-duotone"
              :label="t('settings.pages.card.sync.deleted.restore')"
              :disabled="restoringDeletedId === card.id"
              @click="handleRestoreDeletedCard(card)"
            />
          </div>
        </div>
      </div>
    </Callout>

    <!-- Disclosure: a signed-in user who has not turned cloud sync on -->
    <p v-else-if="isAuthenticated" :class="['flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400']">
      <span i-solar:cloud-cross-outline :class="['shrink-0']" />
      {{ t('settings.pages.card.sync.off_notice') }}
      <RouterLink to="/settings/system/experimental" class="text-primary-600 dark:text-primary-400 hover:underline">
        {{ t('settings.pages.card.sync.off_notice_link') }}
      </RouterLink>
    </p>

    <!-- Toolbar: search takes a full row when the rest wraps on narrow screens -->
    <div :class="['flex flex-wrap items-center gap-3']">
      <Input
        v-model="searchQuery"
        type="search"
        :placeholder="t('settings.pages.card.search')"
        :class="['min-w-[200px] flex-1']"
      />

      <div :class="['flex items-center gap-2']">
        <span :class="['whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.card.sort_by') }}:
        </span>
        <ComboboxSelect
          v-model="sortOption"
          :options="[
            { value: 'nameAsc', label: t('settings.pages.card.name_asc') },
            { value: 'nameDesc', label: t('settings.pages.card.name_desc') },
            { value: 'recent', label: t('settings.pages.card.recent') },
          ]"
          :placeholder="t('settings.pages.card.sort_by')"
          class="min-w-[150px]"
        />
      </div>

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
        @click="handleCardCreationDialog"
      />
      <input
        ref="uploadInput"
        type="file"
        accept=".zip"
        class="hidden"
        @change="handleUploadChange"
      >
    </div>

    <!-- Card grid and drop zone -->
    <div
      :class="['relative mt-4']"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div
        :class="{ 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 grid-auto-rows-[minmax(min-content,max-content)] grid-auto-flow-dense sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]': cards.size > 0 }"
      >
        <!-- Card Items -->
        <template v-if="cards.size > 0">
          <CardListItem
            v-for="item in sortedFilteredCards"
            :id="item.id"
            :key="item.id"
            :name="item.name"
            :description="item.description"
            :is-active="item.id === activeCardId"
            :version="getVersionNumber(item.id)"
            :model-id="item.displayModelId"
            :sync-state="cardSyncStates[item.id]"
          />
        </template>

        <!-- No cards message -->
        <div
          v-if="cards.size === 0"
          :class="[
            'col-span-full rounded-xl p-8 text-center',
            'border border-neutral-200/50 dark:border-neutral-700/30',
            'bg-neutral-50/50 dark:bg-neutral-900/50',
          ]"
        >
          <div i-solar:card-search-broken :class="['mx-auto mb-3 text-6xl text-neutral-400']" />
          <p>{{ t('settings.pages.card.no_cards') }}</p>
        </div>

        <!-- No search results -->
        <Alert v-if="searchQuery && sortedFilteredCards.length === 0" type="warning">
          <template #title>
            {{ t('settings.pages.card.no_results') }}
          </template>
          <template #content>
            {{ t('settings.pages.card.try_different_search') }}
          </template>
        </Alert>
      </div>

      <!-- Drop overlay -->
      <div
        v-if="isDraggingFile"
        :class="[
          'pointer-events-none absolute inset-0 z-10',
          'flex flex-col items-center justify-center gap-2 rounded-xl',
          'border-2 border-dashed border-primary-400 dark:border-primary-500',
          'bg-primary-500/10 dark:bg-primary-400/10',
        ]"
      >
        <div i-solar:upload-minimalistic-bold :class="['text-4xl text-primary-500 dark:text-primary-400']" />
        <p :class="['text-sm font-medium text-primary-600 dark:text-primary-300']">
          {{ t('settings.pages.card.drop_here') }}
        </p>
      </div>
    </div>
  </div>

  <!-- Background decoration -->
  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:emoji-funny-square-bold-duotone />
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
