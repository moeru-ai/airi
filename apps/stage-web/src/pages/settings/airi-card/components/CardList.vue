<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Props & Emits
const props = defineProps<{
  uploadError: string | null
  selectedCardId: string | null
}>()
const emit = defineEmits<{
  openPreview: [id: string]
  selectCard: [id: string]
}>()
// Core setup
const { t } = useI18n()
const cardStore = useAiriCardStore()
const { cards, activeCard } = storeToRefs(cardStore)
const { removeCard, exportCard } = cardStore

// Computed
const hasCards = computed(() => cards.value.size > 0)

// Card state helpers
const cardState = {
  isActive: (id: string) => activeCard.value && cards.value.has(id) && cards.value.get(id) === activeCard.value,
  isSelected: (id: string) => props.selectedCardId === id,
  exists: (id: string) => cards.value.has(id),
  isDefault: (id: string) => id === 'default',
}

// Card actions
const cardActions = {
  select: (id: string) => {
    if (cardState.exists(id)) {
      emit('selectCard', id)
    }
  },

  preview: (id: string, event: Event) => {
    event.stopPropagation()
    if (cardState.exists(id)) {
      emit('openPreview', id)
    }
  },

  delete: (id: string, event: Event) => {
    event.stopPropagation()

    if (cardState.isDefault(id)) {
      console.error(t('settings.pages.card.cannot_delete_default'))
      return
    }

    removeCard(id)
  },

  export: (id: string, event: Event) => {
    event.stopPropagation()
    exportCard(id)
  },
}

// Card display helpers
const cardDisplay = {
  truncateDescription: (desc?: string) => {
    if (!desc)
      return ''
    return desc.length > 100 ? `${desc.slice(0, 100)}...` : desc
  },
}
</script>

<template>
  <div
    rounded-lg p-6
    border="~ neutral-200 dark:neutral-800"
    bg="neutral-50 dark:neutral-900"
  >
    <!-- Header -->
    <div flex="~ row" mb-4 items-center justify-between>
      <h2 text-xl font-medium>
        {{ t('settings.pages.card.list') }}
      </h2>
    </div>

    <!-- Card List -->
    <div v-if="hasCards" flex="~ col" gap-3>
      <div
        v-for="[id, card] in cards"
        :key="id"
        relative
        :class="[
          cardState.isSelected(id) ? 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20' : '',
        ]"
      >
        <!-- Card Content -->
        <div
          flex="~ row"
          cursor-pointer items-center gap-4 rounded-lg p-4 transition
          hover="bg-neutral-100 dark:bg-neutral-800"
          @click="cardActions.select(id)"
        >
          <div
            class="i-lucide:id-card text-2xl"
            :class="[cardState.isActive(id) ? 'text-primary-500' : 'text-neutral-400']"
          />
          <div flex="~ col" flex-1>
            <div font-medium>
              {{ card.name }}
            </div>
            <div text="sm neutral-500" mt-1>
              {{ cardDisplay.truncateDescription(card.description) }}
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="absolute right-2 top-2 z-10 flex gap-2">
          <button
            v-if="!cardState.isDefault(id)"
            hover="bg-red-100 dark:bg-red-900/30 text-red-600"
            rounded-full p-2 transition
            @click.stop="cardActions.delete(id, $event)"
          >
            <div i-solar:trash-bin-trash-linear text-lg />
          </button>

          <button
            hover="bg-primary-100 dark:bg-primary-900/30 text-primary-600"
            rounded-full p-2 transition
            @click.stop="cardActions.export(id, $event)"
          >
            <div i-solar:export-linear text-lg />
          </button>

          <button
            hover="bg-blue-100 dark:bg-blue-900/30 text-blue-600"
            rounded-full p-2 transition
            @click.stop="cardActions.preview(id, $event)"
          >
            <div i-solar:eye-bold text-lg />
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!hasCards" p-6 text-center text="neutral-500">
      {{ t('settings.pages.card.empty') }}
    </div>
  </div>
</template>
