<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { Button } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import DeleteCardDialog from './DeleteCardDialog.vue'

interface Props {
  modelValue: boolean
  cardId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const cardStore = useAiriCardStore()
const { removeCard } = cardStore
const { activeCardId } = storeToRefs(cardStore)

// Get selected card data
const selectedCard = computed<AiriCard | undefined>(() => {
  if (!props.cardId)
    return undefined
  return cardStore.getCard(props.cardId)
})

// Get module settings
const moduleSettings = computed(() => {
  if (!selectedCard.value || !selectedCard.value.extensions?.airi?.modules) {
    return {
      consciousness: '',
      speech: '',
      voice: '',
    }
  }

  const airiExt = selectedCard.value.extensions.airi.modules
  return {
    consciousness: airiExt.consciousness?.model || '',
    speech: airiExt.speech?.model || '',
    voice: airiExt.speech?.voice_id || '',
  }
})

// Get character settings
const characterSettings = computed(() => {
  if (!selectedCard.value)
    return {}

  return {
    personality: selectedCard.value.personality,
    scenario: selectedCard.value.scenario,
    systemPrompt: selectedCard.value.systemPrompt,
    postHistoryInstructions: selectedCard.value.postHistoryInstructions,
  }
})

// Check if card is active
const isActive = computed(() => props.cardId === activeCardId.value)

// Animation control for card activation
const isActivating = ref(false)

function handleActivate() {
  isActivating.value = true
  setTimeout(() => {
    activeCardId.value = props.cardId
    isActivating.value = false
  }, 300)
}

function hightlightTagToHtml(text: string) {
  return text?.replace(/\{\{(.*?)\}\}/g, '<span class="bg-primary-500/20 inline-block">{{ $1 }}</span>').trim()
}

// Delete confirmation
const showDeleteConfirm = ref(false)

function handleDeleteConfirm() {
  if (selectedCard.value) {
    removeCard(props.cardId)
    emit('update:modelValue', false)
  }
  showDeleteConfirm.value = false
}

// Tab type definition
interface Tab {
  id: string
  label: string
  icon: string
}

// Active tab ID state
const activeTabId = ref('')

// Tabs for card details
const tabs = computed<Tab[]>(() => {
  const availableTabs: Tab[] = []

  // Description tab - always show if there's description
  if (selectedCard.value?.description) {
    availableTabs.push({
      id: 'description',
      label: t('settings.pages.card.description_label'),
      icon: 'i-solar:document-text-linear',
    })
  }

  // Notes tab - only show if there are creator notes
  if (selectedCard.value?.notes) {
    availableTabs.push({
      id: 'notes',
      label: t('settings.pages.card.creator_notes'),
      icon: 'i-solar:notes-linear',
    })
  }

  // Character tab - only show if there are character settings
  if (Object.values(characterSettings.value).some(value => !!value)) {
    availableTabs.push({
      id: 'character',
      label: t('settings.pages.card.character'),
      icon: 'i-solar:user-rounded-linear',
    })
  }

  // Modules tab - always show
  availableTabs.push({
    id: 'modules',
    label: t('settings.pages.card.modules'),
    icon: 'i-solar:tuning-square-linear',
  })

  return availableTabs
})

// Active tab state - set to first available tab by default
const activeTab = computed({
  get: () => {
    // If current active tab is not in available tabs, reset to first tab
    if (!tabs.value.find(tab => tab.id === activeTabId.value))
      return tabs.value[0]?.id || ''
    return activeTabId.value
  },
  set: (value: string) => {
    activeTabId.value = value
  },
})
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-100 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-100 m-0 max-h-[90vh] max-w-6xl w-[92vw] flex flex-col overflow-auto border border-neutral-200 rounded-xl bg-white p-5 shadow-xl 2xl:w-[60vw] lg:w-[80vw] md:w-[85vw] xl:w-[70vw] -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-800 sm:p-6">
        <div v-if="selectedCard" class="w-full flex flex-col gap-5">
          <!-- Header with status indicator -->
          <div flex="~ col" gap-3>
            <div flex="~ row" items-center justify-between>
              <div>
                <div flex="~ row" items-center gap-2>
                  <DialogTitle text-2xl font-normal class="from-primary-500 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent">
                    {{ selectedCard.name }}
                  </DialogTitle>
                  <div v-if="isActive" class="flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-600 font-medium dark:bg-primary-900/40 dark:text-primary-400">
                    <div i-solar:check-circle-bold-duotone text-xs />
                    {{ t('settings.pages.card.active_badge') }}
                  </div>
                </div>
                <div mt-1 text-sm text-neutral-500 dark:text-neutral-400>
                  v{{ selectedCard.version }}
                  <template v-if="selectedCard.creator">
                    · {{ t('settings.pages.card.created_by') }} <span font-medium>{{ selectedCard.creator }}</span>
                  </template>
                </div>
              </div>

              <!-- Action buttons -->
              <div flex="~ row" gap-2>
                <!-- Activation button -->
                <Button
                  variant="primary"
                  :icon="isActive ? 'i-solar:check-circle-bold-duotone' : 'i-solar:play-circle-broken'"
                  :label="isActive ? t('settings.pages.card.active') : t('settings.pages.card.activate')"
                  :disabled="isActive"
                  :class="{ 'animate-pulse': isActivating }"
                  @click="handleActivate"
                />
              </div>
            </div>

            <!-- Card content tabs -->
            <div class="mt-4">
              <div class="border-b border-neutral-200 dark:border-neutral-700">
                <div class="flex justify-center -mb-px sm:justify-start space-x-1">
                  <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    class="px-4 py-2 text-sm font-medium"
                    :class="[
                      activeTab === tab.id
                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 dark:border-primary-400'
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300',
                    ]"
                    @click="activeTab = tab.id"
                  >
                    <div class="flex items-center gap-1">
                      <div :class="tab.icon" />
                      {{ tab.label }}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- Creator notes -->
            <div v-if="activeTab === 'notes' && selectedCard.notes">
              <div
                bg="white/60 dark:black/30"
                border="~ neutral-200/50 dark:neutral-700/30"
                max-h-60 overflow-auto whitespace-pre-line rounded-lg p-4 text-neutral-700 sm:max-h-80 dark:text-neutral-300 transition="all duration-200"
                hover="bg-white/80 dark:bg-black/40"
                v-html="hightlightTagToHtml(selectedCard.notes)"
              />
            </div>

            <!-- Description section -->
            <div v-if="activeTab === 'description' && selectedCard.description">
              <div
                bg="white/60 dark:black/30"
                max-h-60 overflow-auto whitespace-pre-line rounded-lg p-4 sm:max-h-80
                text="neutral-600 dark:neutral-300"
                border="~ neutral-200/50 dark:neutral-700/30"
                v-html="hightlightTagToHtml(selectedCard.description)"
              />
            </div>

            <!-- Character -->
            <div v-if="activeTab === 'character' && Object.values(characterSettings).some(value => !!value)">
              <div flex="~ col" max-h-60 gap-4 overflow-auto pr-1 sm:max-h-80>
                <template v-for="(value, key) in characterSettings" :key="key">
                  <div v-if="value" flex="~ col" gap-2>
                    <h2 text-lg text-neutral-500 font-medium dark:text-neutral-400>
                      {{ t(`settings.pages.card.${key.toLowerCase()}`) }}
                    </h2>
                    <div
                      bg="white/60 dark:black/30"
                      border="~ neutral-200/50 dark:neutral-700/30"
                      transition="all duration-200"
                      hover="bg-white/80 dark:bg-black/40"
                      max-h-none overflow-auto whitespace-pre-line rounded-lg p-3 text-neutral-700 dark:text-neutral-300
                      v-html="hightlightTagToHtml(value)"
                    />
                  </div>
                </template>
              </div>
            </div>

            <!-- Modules -->
            <div v-if="activeTab === 'modules'">
              <div grid="~ cols-1 sm:cols-3" gap-4>
                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-1 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:ghost />
                    {{ t('settings.pages.card.consciousness.model') }}
                  </span>
                  <div truncate font-medium>
                    {{ moduleSettings.consciousness ?? 'default' }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-2 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:mic />
                    {{ t('settings.pages.card.speech.model') }}
                  </span>
                  <div truncate font-medium>
                    {{ moduleSettings.speech ?? 'default' }}
                  </div>
                </div>

                <div
                  flex="~ col"
                  bg="white/60 dark:black/30"
                  gap-2 rounded-lg p-3
                  border="~ neutral-200/50 dark:neutral-700/30"
                  transition="all duration-200"
                  hover="bg-white/80 dark:bg-black/40"
                >
                  <span flex="~ row" items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400>
                    <div i-lucide:music />
                    {{ t('settings.pages.card.speech.voice') }}
                  </span>
                  <div truncate font-medium>
                    {{ moduleSettings.voice ?? 'default' }}
                  </div>
                </div>
              </div>
            </div>
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
          {{ t('settings.pages.card.card_not_found') }}
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <!-- Delete confirmation dialog -->
  <DeleteCardDialog
    v-model="showDeleteConfirm"
    :card-name="selectedCard?.name"
    @confirm="handleDeleteConfirm"
    @cancel="showDeleteConfirm = false"
  />
</template>
