<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { useConsciousnessStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CardBasicInfo from './Editor/CardBasicInfo.vue'
import CardExtensionsEditor from './Editor/CardExtensionsEditor.vue'
import CardJsonEditor from './Editor/CardJsonEditor.vue'
import CardModelsEditor from './Editor/CardModelsEditor.vue'
import CardPromptEditor from './Editor/CardPromptEditor.vue'

interface Props {
  card: AiriCard | null
}

interface Emits {
  (e: 'save', card: AiriCard): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()
const consciousnessStore = useConsciousnessStore()
const {
  activeModel,
} = storeToRefs(consciousnessStore)
const speechStore = useSpeechStore()
const {
  activeSpeechVoiceId,
} = storeToRefs(speechStore)

// Editing state
const editingCard = ref<AiriCard | null>(null)

// Watch for card changes and update editing state
watch(
  () => props.card,
  (newCard) => {
    editingCard.value = newCard ? JSON.parse(JSON.stringify(newCard)) : null
  },
  { immediate: true },
)

// Card operations
function saveCardChanges() {
  if (!editingCard.value)
    return

  emit('save', editingCard.value)
}

async function handleSyncModels() {
  if (!editingCard.value)
    return

  // Initialize or update models
  if (!editingCard.value.models) {
    editingCard.value.models = {
      consciousness: activeModel.value,
      voice: activeSpeechVoiceId.value || 'alloy', // Use current voice or fallback
    }
  }
  else {
    editingCard.value.models.consciousness = activeModel.value
    editingCard.value.models.voice = activeSpeechVoiceId.value || editingCard.value.models.voice || 'alloy'
  }
}

function handleCardUpdate(updatedCard: AiriCard) {
  editingCard.value = updatedCard
}
</script>

<template>
  <div v-if="!editingCard" class="h-full flex items-center justify-center p-8 text-neutral-500">
    {{ t('settings.pages.card.select_to_edit') || 'Select a card to edit' }}
  </div>

  <div v-else class="flex flex-col gap-6">
    <!-- Header with sticky save button -->
    <div flex="~ row" sticky top-0 z-10 items-center justify-between py-4 bg="white dark:neutral-900" border-b="~ neutral-200 dark:neutral-800">
      <div flex="~ row" items-center gap-3>
        <button
          bg="neutral-100 dark:neutral-800"
          hover="bg-neutral-200 dark:neutral-700"
          rounded-full p-2 transition
          @click="$router.back()"
        >
          <div i-solar:arrow-left-linear text-lg />
        </button>
        <h2 text-xl font-medium>
          {{ t('settings.pages.card.edit') }} - {{ editingCard.name }}
        </h2>
      </div>
      <button
        bg="primary-500"
        hover="bg-primary-600"
        text="white"
        flex="~ row" items-center gap-2 rounded-lg px-5 py-2 transition
        @click="saveCardChanges"
      >
        <div i-solar:disk-linear text-sm />
        {{ t('common.save') }}
      </button>
    </div>

    <div flex="~ col" mx-auto max-w-4xl w-full gap-6 pb-6>
      <CardBasicInfo :card="editingCard" />

      <CardPromptEditor :card="editingCard" />

      <CardModelsEditor
        :card="editingCard"
        @sync-models="handleSyncModels"
      />

      <CardExtensionsEditor
        :card="editingCard"
      />

      <CardJsonEditor
        :card="editingCard"
        @update:card="handleCardUpdate"
      />
    </div>
  </div>
</template>
