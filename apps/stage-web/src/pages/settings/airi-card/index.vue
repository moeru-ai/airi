<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { useAiriCardStore, useConsciousnessStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import CardEdit from './components/CardEdit.vue'
import CardList from './components/CardList.vue'
import CardMetadata from './components/CardMetadata.vue'
import CardPreviewDialog from './components/CardPreviewDialog.vue'
import CardUploadDialog from './components/CardUploadDialog.vue'

// Core setup
const router = useRouter()
const { t } = useI18n()
const cardStore = useAiriCardStore()
const { cards, activeCard, cardsRaw } = storeToRefs(cardStore)
const { setActiveCard } = cardStore

// Card preview dialog state
const previewDialog = reactive({
  isOpen: false,
  cardId: null as string | null,
  cardData: computed<AiriCard | null>(() => {
    if (!previewDialog.cardId || !cards.value.has(previewDialog.cardId))
      return null
    const card = cards.value.get(previewDialog.cardId)
    return card as AiriCard
  }),
  open(id: string) {
    if (cards.value.has(id)) {
      previewDialog.cardId = id
      previewDialog.isOpen = true
    }
  },
  close() {
    previewDialog.isOpen = false
    previewDialog.cardId = null
  },
  activate() {
    if (previewDialog.cardId) {
      setActiveCard(previewDialog.cardId)
      previewDialog.close()
    }
  },
})

// Upload dialog state
const uploadDialog = reactive({
  isOpen: false,
  error: null as string | null,
})

// Card editing state
const editingCard = reactive({
  id: 'default' as string | null, // Initialize with default card
  data: computed<AiriCard | null>(() => {
    if (!editingCard.id || !cards.value.has(editingCard.id))
      return null
    const card = cards.value.get(editingCard.id)
    return card as AiriCard
  }),
  select(id: string) {
    if (cards.value.has(id))
      editingCard.id = id
  },
  save(cardData: AiriCard) {
    if (!editingCard.id)
      return

    cards.value.set(editingCard.id, cardData)
    cardsRaw.value.set(editingCard.id, JSON.stringify(cardData, null, 2))
  },
})

// Helper functions
function isActiveCard(id: string): boolean {
  return !!activeCard.value && cards.value.has(id) && cards.value.get(id) === activeCard.value
}

const consciousnessStore = useConsciousnessStore()
const speechStore = useSpeechStore()

const {
  activeModel: activeConsciousnessModel,
} = storeToRefs(consciousnessStore)
const {
  activeSpeechModel,
  activeSpeechVoiceId,
} = storeToRefs(speechStore)
watch(activeCard, (newCard: AiriCard | undefined) => {
  if (!newCard)
    return

  // TODO: live2d, vrm
  // TODO: Minecraft Agent, etc

  activeConsciousnessModel.value = newCard?.models?.consciousness
  activeSpeechModel.value = newCard?.models?.voice
  activeSpeechVoiceId.value = newCard?.models?.voice
})
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

  <div grid="~ cols-1 lg:cols-2 gap-6" mt-6>
    <div flex="~ col" gap-6>
      <CardUploadDialog
        :is-open="uploadDialog.isOpen"
        @close="uploadDialog.isOpen = false"
        @error="uploadDialog.error = $event"
      />

      <CardList
        :upload-error="uploadDialog.error"
        :selected-card-id="editingCard.id"
        @open-preview="previewDialog.open"
        @select-card="editingCard.select"
      />

      <CardMetadata
        v-if="editingCard.id && editingCard.data"
        :card-id="editingCard.id"
        :card="editingCard.data"
      />
    </div>

    <div
      rounded-lg p-6
      border="~ neutral-200 dark:neutral-800"
      bg="neutral-50 dark:neutral-900"
    >
      <CardEdit
        :card="editingCard.data"
        @save="editingCard.save"
      />
    </div>
  </div>

  <CardPreviewDialog
    :is-open="previewDialog.isOpen"
    :card-id="previewDialog.cardId"
    :card="previewDialog.cardData"
    :is-active="!!previewDialog.cardId && isActiveCard(previewDialog.cardId)"
    @close="previewDialog.close"
    @activate="previewDialog.activate"
  />

  <div text="neutral-200/50 dark:neutral-600/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
    <div text="40" i-lucide:id-card />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
