<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AiriCardView from '../components/AiriCardView.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const cardStore = useAiriCardStore()
const { getCard } = cardStore
const { activeCardId } = storeToRefs(cardStore)

// Get card ID from route params
const routeId = route.params.id
const cardId = computed(() => (Array.isArray(routeId) ? routeId[0] : String(routeId || '')))

// Get current card
const card = computed(() => getCard(cardId.value))

// Handle card not found
if (!card.value) {
  router.replace('/settings/airi-card')
}

// Activate card when selected
function activateSelectedCard() {
  if (cardId.value)
    activeCardId.value = cardId.value
}

// Handle card deletion by going back to card list
function handleCardDelete() {
  router.replace('/settings/airi-card')
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

  <!-- Card content area -->
  <AiriCardView
    v-if="card"
    :card-id="cardId"
    @activate="activateSelectedCard"
    @delete="handleCardDelete"
  />
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
