<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { AiriCardPackageError, importAiriCardPackage } from '@proj-airi/stage-ui/services/airi-card-import-export'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Callout, Input, InputFileCard } from '@proj-airi/ui'
import { ComboboxSelect } from '@proj-airi/ui/components/form'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import CardCreate from './components/CardCreate.vue'
import CardDetailDialog from './components/CardDetailDialog.vue'
import CardListItem from './components/CardListItem.vue'
import DeleteCardDialog from './components/DeleteCardDialog.vue'

import { formatRelativeTime } from './composables/relative-time'

const { t, locale } = useI18n()
const cardStore = useAiriCardStore()
const displayModelsStore = useDisplayModelsStore()
const { addCard, removeCard } = cardStore
const { cards, activeCardId, cardSyncStates, cloudSyncEnabled } = storeToRefs(cardStore)
const { isAuthenticated } = storeToRefs(useAuthStore())

const route = useRoute()
const router = useRouter()

// Currently selected card ID (different from active card ID)
const selectedCardId = ref<string>('')
// Initial tab to open in the dialog
const initialTabId = ref<string>('')
// Dialog state
const isCardDialogOpen = ref(false)

// Search query
const searchQuery = ref('')

// Sort option
const sortOption = ref<'nameAsc' | 'nameDesc' | 'recent'>('nameAsc')

const inputFiles = ref<File[]>([])

// Card list data structure
interface CardItem {
  id: string
  name: string
  description?: string
  deprecated?: boolean
  customizable?: boolean
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

// Delete confirmation
const showDeleteConfirm = ref(false)
const cardToDelete = ref<string | null>(null)

async function handleDeleteConfirm() {
  if (cardToDelete.value) {
    await removeCard(cardToDelete.value)
    cardToDelete.value = null
    showDeleteConfirm.value = false
  }
}

// Card deletion confirmation
function confirmDelete(id: string) {
  cardToDelete.value = id
  showDeleteConfirm.value = true
}

function handleSelectCard(cardId: string) {
  // Verify card exists before opening dialog
  if (!cards.value.has(cardId)) {
    console.error(`Card with id ${cardId} not found`)
    return
  }
  selectedCardId.value = cardId
  isCardDialogOpen.value = true
}

function handleEditCard(cardId: string) {
  if (!cards.value.has(cardId)) {
    console.error(`Card with id ${cardId} not found`)
    return
  }
  void router.push(`/settings/airi-card/${encodeURIComponent(cardId)}/edit`)
}

function handleCardCreationDialog() {
  void router.push('/settings/airi-card/new')
}

// Card activation
function activateCard(id: string) {
  void cardStore.activateCard(id)
}

watch(activeCardId, (cardId, previousCardId) => {
  if (!previousCardId || cardId === previousCardId)
    return

  const activeCard = cards.value.get(cardId)
  if (activeCard)
    toast(t('settings.pages.card.activation_notice', { name: activeCard.name }))
})

// Clear initial tab when detail dialog closes
watch(isCardDialogOpen, (isOpen) => {
  if (!isOpen) {
    initialTabId.value = ''
  }
})

// Handle deep-linking from query params
watch(() => [route.query.cardId, route.query.tab], ([cardId, tab]) => {
  if (!cardId || typeof cardId !== 'string' || !cards.value.has(cardId))
    return

  const targetTab = typeof tab === 'string' ? tab : ''
  selectedCardId.value = cardId
  initialTabId.value = targetTab

  // Gallery or other viewing tabs go to Detail dialog
  if (['gallery', 'description', 'notes', 'character'].includes(targetTab)) {
    isCardDialogOpen.value = true
  }
  // Artistry or other editing tabs go to Creation/Edit dialog
  else if (['artistry', 'identity', 'behavior', 'modules', 'settings'].includes(targetTab)) {
    void router.replace({
      path: `/settings/airi-card/${encodeURIComponent(cardId)}/edit`,
      query: { section: targetTab },
    })
    return
  }
  else {
    // Default to detail if tab is unknown
    isCardDialogOpen.value = true
  }

  // Clear query params to prevent re-triggering and keep URL clean
  void router.replace({ query: {} })
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

// Card module short name
function getModuleShortName(id: string, module: 'consciousness' | 'voice') {
  const card = cards.value.get(id)
  if (!card || !card.extensions?.airi?.modules)
    return 'default'

  const airiExt = card.extensions.airi.modules

  if (module === 'consciousness') {
    return airiExt.consciousness?.model ? airiExt.consciousness.model.split('-').pop() || 'default' : 'default'
  }
  else if (module === 'voice') {
    return airiExt.speech?.voice_id || 'default'
  }

  return 'default'
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

    <!-- Toolbar with search and sort -->
    <div :class="['flex flex-wrap items-center gap-3']">
      <!-- Search bar -->
      <div :class="['relative min-w-[200px] flex-1']">
        <div :class="['pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3']">
          <div i-solar:magnifer-line-duotone :class="['text-neutral-400 dark:text-neutral-500']" />
        </div>
        <Input
          v-model="searchQuery"
          type="search"
          class="pl-9!"
          :placeholder="t('settings.pages.card.search')"
        />
      </div>

      <!-- Sort options -->
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
    </div>

    <!-- Masonry card layout -->
    <div
      class="mt-4"
      :class="{ 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 grid-auto-rows-[minmax(min-content,max-content)] grid-auto-flow-dense sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]': cards.size > 0 }"
    >
      <!-- Upload and create stay compact side by side on narrow screens. -->
      <div :class="['col-span-full grid grid-cols-2 gap-4 sm:contents']">
        <!-- Upload card -->
        <InputFileCard v-model="inputFiles" accept=".zip">
          <template #default="{ isDragging }">
            <template v-if="!isDragging">
              <div :class="['flex flex-col items-center text-center']">
                <div i-solar:upload-square-line-duotone :class="['mb-1 text-3xl text-neutral-400 sm:mb-4 sm:text-5xl dark:text-neutral-500']" />
                <p :class="['text-sm font-medium text-neutral-600 sm:text-base dark:text-neutral-300']">
                  {{ t('settings.pages.card.upload') }}
                </p>
                <p :class="['mt-2 hidden text-sm text-neutral-500 sm:block dark:text-neutral-400']">
                  {{ t('settings.pages.card.upload_desc') }}
                </p>
              </div>
            </template>
            <template v-else>
              <div :class="['flex flex-col items-center text-center']">
                <div i-solar:upload-minimalistic-bold :class="['mb-1 text-3xl text-primary-500 sm:mb-2 sm:text-5xl dark:text-primary-400']" />
                <p :class="['text-sm font-medium text-primary-600 sm:text-base dark:text-primary-300']">
                  {{ t('settings.pages.card.drop_here') }}
                </p>
              </div>
            </template>
          </template>
        </InputFileCard>

        <!-- Create card -->
        <CardCreate @click="handleCardCreationDialog" />
      </div>

      <!-- Card Items -->
      <template v-if="cards.size > 0">
        <CardListItem
          v-for="item in sortedFilteredCards"
          :id="item.id"
          :key="item.id"
          :name="item.name"
          :description="item.description"
          :is-active="item.id === activeCardId"
          :is-selected="item.id === selectedCardId && isCardDialogOpen"
          :version="getVersionNumber(item.id)"
          :consciousness-model="getModuleShortName(item.id, 'consciousness')"
          :voice-model="getModuleShortName(item.id, 'voice')"
          :sync-state="cardSyncStates[item.id]"
          @select="handleSelectCard(item.id)"
          @activate="activateCard(item.id)"
          @delete="confirmDelete(item.id)"
          @edit="handleEditCard(item.id)"
        />
      </template>

      <!-- No cards message -->
      <div
        v-if="cards.size === 0"
        class="col-span-full rounded-xl p-8 text-center"
        border="~ neutral-200/50 dark:neutral-700/30"
        bg="neutral-50/50 dark:neutral-900/50"
      >
        <div i-solar:card-search-broken mx-auto mb-3 text-6xl text-neutral-400 />
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
  </div>

  <!-- Delete confirmation dialog -->
  <DeleteCardDialog
    v-model="showDeleteConfirm"
    :card-name="cardToDelete ? cardStore.getCard(cardToDelete)?.name : ''"
    @confirm="handleDeleteConfirm"
    @cancel="cardToDelete = null"
  />

  <!-- Card detail dialog -->
  <CardDetailDialog
    v-model="isCardDialogOpen"
    :card-id="selectedCardId"
    :initial-tab="initialTabId"
  />

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
