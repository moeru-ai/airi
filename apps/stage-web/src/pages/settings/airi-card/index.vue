<script setup lang="ts">
import type { ccv3 } from '@proj-airi/ccc'

import { Button } from '@proj-airi/stage-ui/components/Button'
import { RadioCardDetailManySelect } from '@proj-airi/stage-ui/components/Form'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AiriCardView from './components/AiriCardView.vue'

const router = useRouter()
const { t } = useI18n()
const cardStore = useAiriCardStore()
const { addCard } = cardStore
const { cards, activeCardId } = storeToRefs(cardStore)

// Currently selected card ID (different from active card ID)
const selectedCardId = ref<string>(activeCardId.value || '')

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
    }
    catch (error) {
      console.error('Error processing card file:', error)
    }
  }

  fileInput.click()
}

/**
 * Sets the selected card as active
 */
function activateSelectedCard() {
  if (selectedCardId.value)
    activeCardId.value = selectedCardId.value
}

/**
 * Handles card deletion
 */
function handleCardDelete() {
  // Reset selected card ID if it's the one being deleted
  selectedCardId.value = cardsArray.value.length > 0 ? cardsArray.value[0].id : ''
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
    <!-- Toolbar -->
    <div flex="~ col" gap-6>
      <div flex="~ row gap-2 flex-wrap">
        <!-- Upload button -->
        <Button
          variant="primary"
          icon="i-solar:upload-line-duotone"
          :label="t('settings.pages.card.upload')"
          @click="handleUpload"
        />
      </div>

      <!-- Card selection -->
      <template v-if="cards.size > 0">
        <RadioCardDetailManySelect
          v-model="selectedCardId"
          :items="cardsArray"
          :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
          :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
          :show-more="false"
        />
      </template>
    </div>

    <!-- Card content area -->
    <div v-if="selectedCardId && cards.size > 0" mt-6>
      <AiriCardView
        :card-id="selectedCardId"
        @activate="activateSelectedCard"
        @delete="handleCardDelete"
      />
    </div>

    <!-- Background decoration -->
    <div text="neutral-200/50 dark:neutral-600/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
      <div text="40" i-lucide:id-card />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
