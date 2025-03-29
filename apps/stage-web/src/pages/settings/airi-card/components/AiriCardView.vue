<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Section from '../../../../components/Settings/Section.vue'

interface Props {
  cardId: string
}

interface Emits {
  (e: 'activate'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()
const cardStore = useAiriCardStore()
const { getCard } = cardStore
const { activeCardId } = storeToRefs(cardStore)

// Get current card
const card = computed<AiriCard | undefined>(() => getCard(props.cardId))

// Get module settings
const moduleSettings = computed(() => {
  const airiExt = card.value?.extensions?.airi?.modules
  return {
    consciousness: airiExt?.consciousness?.model || '',
    speech: airiExt?.speech?.model || '',
    voice: airiExt?.speech?.voice_id || '',
  }
})

// Get character settings
const characterSettings = computed(() => {
  if (!card.value)
    return {}

  return {
    personality: card.value.personality,
    scenario: card.value.scenario,
    systemPrompt: card.value.systemPrompt,
    postHistoryInstructions: card.value.postHistoryInstructions,
  }
})

// Check if card is active
const isActive = computed(() => props.cardId === activeCardId.value)

// Activate card
function activateCard() {
  activeCardId.value = props.cardId
  emit('activate')
}

// Animation control for card activation
const isActivating = ref(false)

function handleActivate() {
  isActivating.value = true
  setTimeout(() => {
    activateCard()
    isActivating.value = false
  }, 300)
}
</script>

<template>
  <div
    v-if="card"
    bg="neutral-50 dark:[rgba(0,0,0,0.3)]"
    rounded-xl p-5 flex="~ col gap-5"
    border="~ neutral-200/50 dark:neutral-700/30"
    shadow="sm dark:md"
    transition="all duration-300"
    class="backdrop-blur-sm"
  >
    <!-- Header -->
    <div flex="~ col" gap-3>
      <div flex="~ row" items-center justify-between>
        <div>
          <h1 text-2xl font-bold class="from-primary-500 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent">
            {{ card.name }}
          </h1>
          <div mt-1 text-sm text-neutral-500 dark:text-neutral-400>
            v{{ card.version }}
            <template v-if="card.creator">
              · {{ t('created by') }} <span font-medium>{{ card.creator }}</span>
            </template>
          </div>
        </div>

        <!-- Activation button -->
        <div>
          <button
            v-if="!isActive"
            bg="primary-500 hover:primary-600"
            text="white"
            rounded-lg px-4 py-2
            border="~ transparent"
            shadow="hover:lg"
            transform="hover:scale-105 active:scale-95"
            transition="all duration-200"
            :class="{ 'animate-pulse': isActivating }"
            @click="handleActivate"
          >
            <div flex="~ row" items-center gap-2>
              <div i-solar:electricity-bold-duotone />
              <span>{{ t('Activate') }}</span>
            </div>
          </button>

          <div
            v-else
            bg="success-500"
            text="white"
            flex="~ row" items-center gap-2 rounded-lg px-4 py-2
            shadow="sm"
          >
            <div i-solar:check-circle-bold-duotone />
            <span>{{ t('Active') }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="card.description"
        bg="white/60 dark:black/30"
        mb-2 whitespace-pre-line rounded-lg p-4
        text-neutral-600 dark:text-neutral-300
        border="~ neutral-200/50 dark:neutral-700/30"
        transition="all duration-200"
        hover="bg-white/80 dark:bg-black/40"
      >
        <h2 mb-1 text-neutral-500 font-medium dark:text-neutral-400>
          {{ t('Description') }}
        </h2>
        <div>
          {{ card.description }}
        </div>
      </div>

      <!-- Creator notes -->
      <div v-if="card.notes" mt-2>
        <h2 flex="~ row" mb-2 items-center gap-2 text-lg font-semibold>
          <div i-solar:notes-bold-duotone text-amber-500 />
          {{ t('Creator Notes') }}
        </h2>
        <div
          bg="white/60 dark:black/30"
          whitespace-pre-line rounded-lg p-4
          text-neutral-700 dark:text-neutral-300
          border="~ neutral-200/50 dark:neutral-700/30"
          transition="all duration-200"
          hover="bg-white/80 dark:bg-black/40"
        >
          {{ card.notes }}
        </div>
      </div>
    </div>

    <!-- Character settings -->
    <Section title="Character Settings" icon="i-solar:user-rounded-bold-duotone">
      <div grid="~ cols-1 md:cols-2" gap-4>
        <template v-for="(value, key) in characterSettings" :key="key">
          <div v-if="value" flex="~ col" gap-1>
            <span flex="~ row" items-center gap-1 text-sm text-neutral-500 font-medium dark:text-neutral-400>
              <div v-if="key === 'personality'" i-solar:emoji-funny-circle-bold-duotone text-violet-500 />
              <div v-if="key === 'scenario'" i-solar:stars-bold-duotone text-blue-500 />
              <div v-if="key === 'systemPrompt'" i-solar:settings-bold-duotone text-green-500 />
              <div v-if="key === 'postHistoryInstructions'" i-solar:chat-square-code-bold-duotone text-orange-500 />
              {{ t(key) }}
            </span>
            <div
              bg="white/60 dark:black/30"
              border="~ neutral-200/50 dark:neutral-700/30"
              transition="all duration-200"
              hover="bg-white/80 dark:bg-black/40"
              max-h-60 overflow-auto whitespace-pre-line rounded-lg p-3 text-neutral-700 dark:text-neutral-300
            >
              {{ value }}
            </div>
          </div>
        </template>
      </div>
    </Section>

    <!-- Module settings -->
    <Section title="Module Settings" icon="i-solar:tuning-square-bold-duotone">
      <div grid="~ cols-1 sm:cols-3" gap-4>
        <div
          flex="~ col"
          bg="white/60 dark:black/30"
          gap-1 rounded-lg p-3
          border="~ neutral-200/50 dark:neutral-700/30"
          transition="all duration-200"
          hover="bg-white/80 dark:bg-black/40"
        >
          <span flex="~ row" items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400>
            <div i-solar:brain-bold-duotone text-purple-500 />
            {{ t('Consciousness Model') }}
          </span>
          <div truncate font-medium>
            {{ moduleSettings.consciousness }}
          </div>
        </div>

        <div
          flex="~ col"
          bg="white/60 dark:black/30"
          gap-1 rounded-lg p-3
          border="~ neutral-200/50 dark:neutral-700/30"
          transition="all duration-200"
          hover="bg-white/80 dark:bg-black/40"
        >
          <span flex="~ row" items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400>
            <div i-solar:microphone-bold-duotone text-blue-500 />
            {{ t('Speech Model') }}
          </span>
          <div truncate font-medium>
            {{ moduleSettings.speech }}
          </div>
        </div>

        <div
          flex="~ col"
          bg="white/60 dark:black/30"
          gap-1 rounded-lg p-3
          border="~ neutral-200/50 dark:neutral-700/30"
          transition="all duration-200"
          hover="bg-white/80 dark:bg-black/40"
        >
          <span flex="~ row" items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400>
            <div i-solar:music-notes-bold-duotone text-pink-500 />
            {{ t('Voice ID') }}
          </span>
          <div truncate font-medium>
            {{ moduleSettings.voice }}
          </div>
        </div>
      </div>
    </Section>
  </div>
  <div
    v-else
    bg="neutral-50/50 dark:neutral-900/50"
    rounded-xl p-8 text-center
    border="~ neutral-200/50 dark:neutral-700/30"
    shadow="sm"
  >
    <div i-solar:card-search-broken mx-auto mb-3 text-6xl text-neutral-400 />
    {{ t('Card not found') }}
  </div>
</template>
