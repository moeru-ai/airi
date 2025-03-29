<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { Button, Section } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'radix-vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

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
    activeCardId.value = 'default'
  }, 300)
}

// Delete card confirmation
const showDeleteConfirm = ref(false)

function handleDeleteConfirm() {
  if (card.value) {
    removeCard(props.cardId)
    emit('delete')
    activateCard()
  }
  showDeleteConfirm.value = false
}

function hightlightTagToHtml(text: string) {
  return text?.replace(/\{\{(.*?)\}\}/g, '<span class="bg-primary-500/20 inline-block">{{ $1 }}</span>').trim()
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
              · {{ t('settings.pages.card.created_by') }} <span font-medium>{{ card.creator }}</span>
            </template>
          </div>
        </div>

        <!-- Action buttons -->
        <div flex="~ row" gap-2>
          <!-- Delete button -->
          <AlertDialogRoot v-if="props.cardId !== 'default'" v-model:open="showDeleteConfirm">
            <AlertDialogTrigger as-child>
              <Button
                variant="danger"
                :label="t('settings.pages.card.delete')"
              />
            </AlertDialogTrigger>
            <AlertDialogPortal>
              <AlertDialogOverlay class="fixed inset-0 z-50 bg-black/50" />
              <AlertDialogContent
                class="fixed left-1/2 top-1/2 z-50 max-w-md w-full border border-neutral-200 rounded-xl bg-white p-6 shadow-xl -translate-x-1/2 -translate-y-1/2 dark:border-neutral-700 dark:bg-neutral-800"
              >
                <AlertDialogTitle class="mb-4 text-xl font-bold">
                  {{ t('settings.pages.card.delete_card') }}
                </AlertDialogTitle>
                <AlertDialogDescription class="mb-6">
                  {{ t('settings.pages.card.delete_confirmation') }} <b>"{{ card.name }}"</b>
                </AlertDialogDescription>

                <div class="flex flex-row justify-end gap-3">
                  <AlertDialogCancel as-child>
                    <Button
                      variant="secondary"
                      :label="t('settings.pages.card.cancel')"
                      @click="() => showDeleteConfirm = false"
                    />
                  </AlertDialogCancel>
                  <AlertDialogAction as-child>
                    <Button
                      variant="danger"
                      :label="t('settings.pages.card.delete')"
                      @click="handleDeleteConfirm"
                    />
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialogPortal>
          </AlertDialogRoot>

          <!-- Activation button -->
          <Button
            variant="primary"
            :label="isActive ? t('settings.pages.card.active') : t('settings.pages.card.activate')"
            :disabled="isActive"
            :class="{ 'animate-pulse': isActivating }"
            @click="handleActivate"
          />
        </div>
      </div>

      <!-- Creator notes -->
      <Section v-if="card.notes" :title="t('settings.pages.card.creator_notes')" icon="i-solar:notes-bold-duotone">
        <div
          bg="white/60 dark:black/30"
          whitespace-pre-line rounded-lg p-4
          text-neutral-700 dark:text-neutral-300
          border="~ neutral-200/50 dark:neutral-700/30"
          transition="all duration-200"
          hover="bg-white/80 dark:bg-black/40"
          v-html="hightlightTagToHtml(card.notes)"
        />
      </Section>

      <!-- Description section -->
      <Section v-if="card.description" :title="t('settings.pages.card.description_label')" icon="i-solar:document-text-bold-duotone">
        <div
          bg="white/60 dark:black/30"
          whitespace-pre-line
          rounded-lg
          p-4
          text="neutral-600 dark:neutral-300"
          border="~ neutral-200/50 dark:neutral-700/30"
          v-html="hightlightTagToHtml(card.description)"
        />
      </Section>

      <!-- Character -->
      <template v-if="Object.values(characterSettings).some(value => !!value)">
        <Section :title="t('settings.pages.card.character')" icon="i-solar:user-rounded-bold-duotone">
          <div flex="~ col" gap-4>
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
                  max-h-60 overflow-auto whitespace-pre-line rounded-lg p-3 text-neutral-700 dark:text-neutral-300
                  v-html="hightlightTagToHtml(value)"
                />
              </div>
            </template>
          </div>
        </Section>
      </template>

      <!-- Modules -->
      <Section :title="t('settings.pages.card.modules')" icon="i-solar:tuning-square-bold-duotone">
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
              {{ t('settings.pages.modules.consciousness.title') }}
            </span>
            <div truncate font-medium>
              {{ moduleSettings.consciousness }}
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
              {{ t('settings.pages.modules.speech.title') }}
            </span>
            <div truncate font-medium>
              {{ moduleSettings.speech }}
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
              <div i-solar:music-notes-bold-duotone />
              {{ t('settings.pages.card.voice_id') }}
            </span>
            <div truncate font-medium>
              {{ moduleSettings.voice }}
            </div>
          </div>
        </div>
      </Section>
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
</template>
