<script setup lang="ts">
import type { ccv3 } from '@proj-airi/ccc'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import CardDetailDialog from './components/CardDetailDialog.vue'
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
interface CardListItem {
  id: string
  name: string
  description?: string
  deprecated?: boolean
  customizable?: boolean
}

// Transform cards Map to array for display
const cardsArray = computed<CardListItem[]>(() =>
  Array.from(cards.value.entries()).map(([id, card]) => ({
    id,
    name: card.name,
    description: card.description,
  })),
)

// Filtered cards based on search query
const filteredCards = computed<CardListItem[]>(() => {
  if (!searchQuery.value)
    return cardsArray.value

  const query = searchQuery.value.toLowerCase()
  return cardsArray.value.filter(item =>
    item.name.toLowerCase().includes(query)
    || (item.description && item.description.toLowerCase().includes(query)),
  )
})

// Sorted filtered cards based on sort option
const sortedFilteredCards = computed<CardListItem[]>(() => {
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

  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
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
      :class="{ 'masonry-grid': cards.size > 0 }"
    >
      <!-- Upload card -->
      <div
        class="upload-card masonry-item relative flex flex-col cursor-pointer items-center justify-center border-2 rounded-xl border-dashed p-6 transition-all duration-300"
        border="neutral-200 dark:neutral-700 hover:primary-300 dark:hover:primary-700"
        bg="white/60 dark:black/30 hover:white/80 dark:hover:black/40"
        min-h-220px
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
        <div
          v-for="item in sortedFilteredCards"
          :key="item.id"
          class="masonry-item card-item relative cursor-pointer overflow-hidden rounded-xl transition-all duration-300"
          :class="[
            item.id === selectedCardId && isCardDialogOpen
              ? 'border-2 border-primary-400 dark:border-primary-600'
              : 'border border-neutral-200/70 dark:border-neutral-700/50',
          ]"
          :style="{ transform: item.id === selectedCardId && isCardDialogOpen ? 'scale(1)' : 'scale(0.98)', opacity: item.id === selectedCardId && isCardDialogOpen ? 1 : 0.95 }"
          hover="scale-100 opacity-100 shadow-md dark:shadow-xl"
          @click="handleSelectCard(item.id)"
        >
          <!-- Card content -->
          <div class="bg-white p-4 dark:bg-neutral-900/90">
            <!-- Card header (name and badge) -->
            <div class="mb-3 flex items-start justify-between">
              <h3 class="truncate text-lg font-bold" :style="{ maxWidth: '85%' }">
                {{ item.name }}
              </h3>
              <div v-if="item.id === activeCardId" class="bg-primary-100 dark:bg-primary-900/40 rounded-md p-1">
                <div i-solar:check-circle-bold-duotone text-primary-500 dark:text-primary-400 text-sm />
              </div>
            </div>

            <!-- Card description -->
            <p v-if="item.description" class="line-clamp-3 mb-3 text-sm text-neutral-600 dark:text-neutral-400">
              {{ item.description }}
            </p>

            <!-- Card stats -->
            <div class="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <div>v{{ getVersionNumber(item.id) }}</div>
              <div class="flex items-center gap-1.5">
                <div class="flex items-center gap-0.5">
                  <div i-lucide:ghost class="text-xs" />
                  <span>{{ getModuleShortName(item.id, 'consciousness') }}</span>
                </div>
                <div class="flex items-center gap-0.5">
                  <div i-lucide:mic class="text-xs" />
                  <span>{{ getModuleShortName(item.id, 'voice') }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Card actions -->
          <div class="flex justify-end gap-1 bg-neutral-50 p-2 dark:bg-neutral-800/50">
            <button
              class="rounded-lg p-1.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
              :disabled="item.id === activeCardId"
              @click.stop="activateCard(item.id)"
            >
              <div
                :class="[
                  item.id === activeCardId
                    ? 'i-solar:check-circle-bold-duotone text-primary-500 dark:text-primary-400'
                    : 'i-solar:play-circle-broken text-neutral-500 dark:text-neutral-400',
                ]"
              />
            </button>
            <button
              v-if="item.id !== 'default'"
              class="rounded-lg p-1.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
              @click.stop="confirmDelete(item.id)"
            >
              <div i-solar:trash-bin-trash-linear text-neutral-500 dark:text-neutral-400 />
            </button>
          </div>
        </div>
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

<style scoped>
.masonry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  grid-gap: 16px;
}

.masonry-item {
  break-inside: avoid;
  margin-bottom: 16px;
}

@media (min-width: 640px) {
  .masonry-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    grid-gap: 20px;
  }
}

@media (min-width: 768px) {
  .masonry-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
}

@media (min-width: 1024px) {
  .masonry-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }
}
</style>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
