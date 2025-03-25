<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  cardId: string
  card: AiriCard
}

const props = defineProps<Props>()

// Core setup
const { t } = useI18n()
const cardStore = useAiriCardStore()
const { cards, activeCard, cardsRaw } = storeToRefs(cardStore)

// Computed properties
const isActive = computed(() =>
  !!activeCard.value
  && cards.value.has(props.cardId)
  && cards.value.get(props.cardId) === activeCard.value,
)

const cardSize = computed(() =>
  cardsRaw.value.get(props.cardId)?.length ?? 0,
)

const cardVersion = computed(() =>
  props.card.version ?? '-',
)
</script>

<template>
  <div
    rounded-lg p-6
    border="~ neutral-200 dark:neutral-800"
    bg="neutral-50 dark:neutral-900"
  >
    <div text="sm neutral-500" mb-4>
      {{ t('settings.pages.card.metadata') }}
    </div>

    <div grid="~ cols-2" gap-4>
      <!-- Card ID -->
      <div>
        <div text="xs neutral-400" mb-1>
          ID
        </div>
        <div font-mono>
          {{ cardId }}
        </div>
      </div>

      <!-- Status -->
      <div>
        <div text="xs neutral-400" mb-1>
          {{ t('common.status') }}
        </div>
        <div flex items-center gap-2>
          <div
            :class="isActive ? 'bg-primary-500' : 'bg-neutral-300'"
            h-2 w-2 rounded-full
          />
          <span>{{ isActive ? t('common.active') : t('common.inactive') }}</span>
        </div>
      </div>

      <!-- Size -->
      <div>
        <div text="xs neutral-400" mb-1>
          {{ t('common.size') }}
        </div>
        <div>{{ cardSize }} bytes</div>
      </div>

      <!-- Version -->
      <div>
        <div text="xs neutral-400" mb-1>
          {{ t('common.version') }}
        </div>
        <div>{{ cardVersion }}</div>
      </div>
    </div>
  </div>
</template>
