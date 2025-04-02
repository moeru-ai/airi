<script setup lang="ts">
import type { ccv3 } from '@proj-airi/ccc'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import CardDetailDialog from './components/CardDetailDialog.vue'
import CardListItem from './components/CardListItem.vue'
import DeleteCardDialog from './components/DeleteCardDialog.vue'

const router = useRouter()
const { t } = useI18n()
const cardStore = useAiriCardStore()
const { addCard, removeCard } = cardStore
const { cards, activeCardId } = storeToRefs(cardStore)

// Currently selected card ID (different from active card ID)
const selectedCardId = ref<string>('')
// Dialog state
const isCardDialogOpen = ref(false)

// Search query
const searchQuery = ref('')

// Sort option
const sortOption = ref('nameAsc')

// Drag and drop
const isDragging = ref(false)

// Card list data structure
interface CardItem {
  id: string
  name: string
  description?: string
  deprecated?: boolean
  customizable?: boolean
}

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
  // Create a new array to avoid mutating the source
  const sorted = [...filteredCards.value]

  if (sortOption.value === 'nameAsc')
    return sorted.sort((a, b) => a.name.localeCompare(b.name))
  else if (sortOption.value === 'nameDesc')
    return sorted.sort((a, b) => b.name.localeCompare(a.name))
  else if (sortOption.value === 'recent')
    return sorted.sort((a, b) => b.id.localeCompare(a.id))
  else
    return sorted
})

// Delete confirmation
const showDeleteConfirm = ref(false)
const cardToDelete = ref<string | null>(null)

function handleDeleteConfirm() {
  if (cardToDelete.value) {
    removeCard(cardToDelete.value)
    cardToDelete.value = null
    showDeleteConfirm.value = false
  }
}

// Card deletion confirmation
function confirmDelete(id: string) {
  cardToDelete.value = id
  showDeleteConfirm.value = true
}

/**
 * Handles card file upload and processing
 */
async function handleUpload() {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.json'

  fileInput.onchange = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file)
      return

    try {
      const content = await file.text()
      const cardJSON = JSON.parse(content) as ccv3.CharacterCardV3

      // Add card and select it
      selectedCardId.value = addCard(cardJSON)
      isCardDialogOpen.value = true
    }
    catch (error) {
      console.error('Error processing card file:', error)
    }
  }

  fileInput.click()
}

function handleSelectCard(cardId: string) {
  selectedCardId.value = cardId
  isCardDialogOpen.value = true
}

// Card activation
function activateCard(id: string) {
  activeCardId.value = id
}

// Card version number
function getVersionNumber(id: string) {
  const card = cards.value.get(id)
  return card?.version || '1.0.0'
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
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-2xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500" text-nowrap>{{ t('settings.title') }}</span>
      </div>
      <div text-nowrap text-3xl font-semibold>
        {{ t('settings.pages.card.title') }}
      </div>
    </h1>
  </div>

  <div rounded-xl p-4 flex="~ col gap-4">
    <!-- Toolbar with search and filters -->
    <div flex="~ row" flex-wrap items-center justify-between gap-4>
      <!-- Search bar -->
      <div class="relative min-w-[200px] flex-1" inline-flex="~" w-full items-center>
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <div i-solar:magnifer-line-duotone class="text-neutral-500 dark:text-neutral-400" />
        </div>
        <input
          v-model="searchQuery"
          type="search"
          class="w-full rounded-xl p-2.5 pl-10 text-sm outline-none"
          border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
          transition="all duration-200 ease-in-out"
          bg="white dark:neutral-900"
          :placeholder="t('settings.pages.card.search')"
        >
      </div>

      <!-- Sort options -->
      <div class="flex items-center gap-2">
        <div text-sm text-neutral-500 dark:text-neutral-400>
          {{ t('settings.pages.card.sort_by') }}:
        </div>
        <select
          v-model="sortOption"
          class="rounded-lg p-1.5 text-sm outline-none"
          border="focus:primary-100 dark:focus:primary-400/50 2 solid neutral-200 dark:neutral-800"
          bg="white dark:neutral-900"
        >
          <option value="nameAsc">
            {{ t('settings.pages.card.name_asc') }}
          </option>
          <option value="nameDesc">
            {{ t('settings.pages.card.name_desc') }}
          </option>
          <option value="recent">
            {{ t('settings.pages.card.recent') }}
          </option>
        </select>
      </div>
    </div>

    <!-- Masonry card layout -->
    <div
      class="mt-4"
      :class="{ 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 grid-auto-rows-[minmax(min-content,max-content)] grid-auto-flow-dense sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]': cards.size > 0 }"
    >
      <!-- Upload card -->
      <div
        class="relative min-h-[120px] flex flex-col cursor-pointer items-center justify-center border-2 rounded-xl border-dashed p-6 transition-all duration-300"
        border="neutral-200 dark:neutral-700 hover:primary-300 dark:hover:primary-700"
        bg="white/60 dark:black/30 hover:white/80 dark:hover:black/40"
        :style="{ transform: 'scale(0.98)', opacity: 0.95 }"
        hover="scale-100 opacity-100 shadow-md dark:shadow-xl"
        @click="handleUpload"
      >
        <div i-solar:upload-square-line-duotone mb-4 text-5xl text="neutral-400 dark:neutral-500" />
        <p font-medium text="center neutral-600 dark:neutral-300">
          {{ t('settings.pages.card.upload') }}
        </p>
        <p text="center neutral-500 dark:neutral-400" mt-2 text-sm>
          {{ t('settings.pages.card.upload_desc') }}
        </p>

        <!-- Drag overlay -->
        <div
          v-if="isDragging"
          class="bg-primary-100/80 border-primary-400 dark:bg-primary-900/80 dark:border-primary-600 absolute inset-0 flex items-center justify-center border-2 rounded-xl"
        >
          <div class="text-center">
            <div i-solar:upload-minimalistic-bold class="dark:text-primary-400 text-primary-500 mb-2 text-5xl" />
            <p font-medium text="primary-600 dark:primary-300">
              {{ t('settings.pages.card.drop_here') }}
            </p>
          </div>
        </div>
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
          @select="handleSelectCard(item.id)"
          @activate="activateCard(item.id)"
          @delete="confirmDelete(item.id)"
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
      <div
        v-if="searchQuery && sortedFilteredCards.length === 0"
        class="col-span-full flex items-center gap-3 border-2 border-amber-200 rounded-xl bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-900/30"
      >
        <div i-solar:info-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
        <div class="flex flex-col">
          <span class="font-medium">{{ t('settings.pages.card.no_results') }}</span>
          <span class="text-sm text-amber-600 dark:text-amber-400">
            {{ t('settings.pages.card.try_different_search') }}
          </span>
        </div>
      </div>
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
  />

  <!-- Background decoration -->
  <div text="neutral-200/50 dark:neutral-600/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
    <div text="40" i-lucide:id-card />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
