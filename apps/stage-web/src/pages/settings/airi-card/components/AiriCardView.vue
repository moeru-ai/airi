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
  (e: 'delete'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()
const cardStore = useAiriCardStore()
const { getCard, removeCard } = cardStore
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

// Delete card confirmation
const showDeleteConfirm = ref(false)

function handleDeleteClick() {
  showDeleteConfirm.value = true
}

function handleDeleteConfirm() {
  if (card.value) {
    removeCard(props.cardId)
    emit('delete')
  }
  showDeleteConfirm.value = false
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
}

const highlightDescriptionHtml = computed(() => {
  return card.value?.description?.replace(/\{\{(.*?)\}\}/g, '<span class="bg-primary-500/20 inline-block">{{ $1 }}</span>').trim()
})
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

        <!-- Action buttons -->
        <div flex="~ row" gap-2>
          <!-- Delete button -->
          <button
            v-if="props.cardId !== 'default'"
            bg="red-500"
            text="white"
            rounded-lg px-4 py-2
            border="~ transparent"
            shadow="sm"
            transition="all duration-200"
            @click="handleDeleteClick"
          >
            <div flex="~ row" items-center gap-2>
              <div i-solar:trash-bin-2-linear />
              <span>{{ t('Delete') }}</span>
            </div>
          </button>

          <!-- Activation button -->
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
            text="white"
            bg="primary-500 hover:primary-600"
            flex="~ row" items-center gap-2 rounded-lg px-4 py-2
            shadow="sm"
          >
            <div i-solar:check-circle-bold-duotone />
            <span>{{ t('Active') }}</span>
          </div>
        </div>
      </div>

      <!-- Creator notes -->
      <Section v-if="card.notes" title="Creator Notes" icon="i-solar:notes-bold-duotone">
        <div
          bg="white/60 dark:black/30"
          whitespace-pre-line rounded-lg p-4
          text-neutral-700 dark:text-neutral-300
          border="~ neutral-200/50 dark:neutral-700/30"
          transition="all duration-200"
          hover="bg-white/80 dark:bg-black/40"
        >
          {{ card.notes.trim() }}
        </div>
      </Section>

      <!-- Description section -->
      <Section v-if="card.description" title="Description" icon="i-solar:document-text-bold-duotone">
        <div
          bg="white/60 dark:black/30"
          whitespace-pre-line
          rounded-lg
          p-4
          text="neutral-600 dark:neutral-300"
          border="~ neutral-200/50 dark:neutral-700/30"
          v-html="highlightDescriptionHtml"
        />
      </Section>

      <!-- Character -->
      <template v-if="Object.values(characterSettings).some(value => !!value)">
        <Section title="Character" icon="i-solar:user-rounded-bold-duotone">
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
      </template>

      <!-- Modules -->
      <Section title="Modules" icon="i-solar:tuning-square-bold-duotone">
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
              <div i-lucide:ghost text-purple-500 />
              {{ t('settings.pages.modules.consciousness.title') }}
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
              <div i-lucide:mic text-blue-500 />
              {{ t('settings.pages.modules.speech.title') }}
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

      <!-- Delete confirmation modal -->
      <Teleport to="body">
        <div
          v-if="showDeleteConfirm"
          fixed inset-0 z-50 flex items-center justify-center
          bg-black:50
          transition="all duration-300 ease-in-out"
          class="bg-black bg-opacity-50 backdrop-blur-sm"
        >
          <div
            bg="white dark:neutral-800"
            mx-4 max-w-md w-full rounded-xl p-6 shadow-xl
            border="~ neutral-200 dark:neutral-700"
          >
            <h3 mb-4 text-xl font-bold>
              {{ t('Delete Card') }}
            </h3>
            <p mb-6>
              {{ t('Are you sure you want to delete this card?') }} <b>"{{ card.name }}"</b>
            </p>

            <div flex="~ row" justify-end gap-3>
              <button
                bg="neutral-200 hover:neutral-300 dark:neutral-700 dark:hover:neutral-600"
                rounded-lg px-4 py-2
                border="~ transparent"
                transition="all duration-200"
                @click="handleDeleteCancel"
              >
                {{ t('Cancel') }}
              </button>
              <button
                bg="red-500 hover:red-600"
                text="white"
                rounded-lg px-4 py-2
                border="~ transparent"
                shadow="hover:lg"
                transition="all duration-200"
                @click="handleDeleteConfirm"
              >
                {{ t('Delete') }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
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
