<script setup lang="ts">
import type { Card } from '@proj-airi/ccc'

import kebabcase from '@stdlib/string-base-kebabcase'

import { Button } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { FieldValues } from '@proj-airi/ui'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  modelValue: boolean
  cardId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

// Use computed for two-way binding
const modelValue = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const cardId = computed(() => props.cardId)

const { t } = useI18n()
const cardStore = useAiriCardStore()

// Tab type definition
interface Tab {
  id: string
  label: string
  icon: string
}

// Active tab ID state
const activeTabId = ref('')

// Tabs for card details
const tabs: Tab[] = [
  { id: 'identity', label: t('settings.pages.card.creation.identity'), icon: 'i-solar:emoji-funny-square-bold-duotone' },
  { id: 'behavior', label: t('settings.pages.card.creation.behavior'), icon: 'i-solar:chat-round-line-bold-duotone' },
  { id: 'settings', label: t('settings.pages.card.creation.settings'), icon: 'i-solar:settings-bold-duotone' },
]

// Active tab state - set to first available tab by default
const activeTab = computed({
  get: () => {
    // If current active tab is not in available tabs, reset to first tab
    if (!tabs.find(tab => tab.id === activeTabId.value))
      return tabs[0]?.id || ''
    return activeTabId.value
  },
  set: (value: string) => {
    activeTabId.value = value
  },
})

// Check for errors, and save built Cards :

const showError = ref<boolean>(false)
const errorMessage = ref<string>('')

function saveCard(card: Card): boolean {
  // Before saving, let's validate what the user entered :
  const rawCard: Card = toRaw(card)

  if (!(rawCard.name!.length > 0)) {
    // No name
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.name')
    return false
  }
  else if (!/^(?:\d+\.)+\d+$/.test(rawCard.version)) {
    // Invalid version
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.version')
    return false
  }
  else if (!(rawCard.description!.length > 0)) {
    // No description
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.description')
    return false
  }
  else if (!(rawCard.personality!.length > 0)) {
    // No personality
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.personality')
    return false
  }
  else if (!(rawCard.scenario!.length > 0)) {
    // No Scenario
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.scenario')
    return false
  }
  else if (!(rawCard.systemPrompt!.length > 0)) {
    // No sys prompt
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.systemprompt')
    return false
  }
  else if (!(rawCard.postHistoryInstructions!.length > 0)) {
    // No post history prompt
    showError.value = true
    errorMessage.value = t('settings.pages.card.creation.errors.posthistoryinstructions')
    return false
  }
  showError.value = false

  // Update the card in the store
  const success = cardStore.updateCard(cardId.value, rawCard)
  if (success) {
    modelValue.value = false // Close the dialog
  }
  return success
}

// Cards data holders :
const card = ref<Card>({
  name: '',
  nickname: undefined,
  version: '1.0',
  description: '',
  notes: undefined,
  personality: '',
  scenario: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  greetings: [],
  messageExample: [],
})

// Initialize card data when component mounts, cardId changes, or dialog opens
onMounted(() => {
  if (modelValue.value && cardId.value) {
    loadCardData()
  }
})

// Watch both cardId and modelValue to ensure data loads when dialog opens
watch([() => props.cardId, () => modelValue.value], ([newCardId, isOpen]) => {
  if (isOpen && newCardId) {
    loadCardData()
  }
})

function loadCardData() {
  const existingCard = cardStore.getCard(cardId.value)
  if (existingCard) {
    // Deep clone to avoid modifying the store directly
    // Ensure all required properties are correctly assigned
    card.value = {
      name: existingCard.name || '',
      nickname: existingCard.nickname,
      version: existingCard.version || '1.0',
      description: existingCard.description || '',
      notes: existingCard.notes,
      personality: existingCard.personality || '',
      scenario: existingCard.scenario || '',
      systemPrompt: existingCard.systemPrompt || '',
      postHistoryInstructions: existingCard.postHistoryInstructions || '',
      greetings: [...(existingCard.greetings || [])],
      messageExample: [...(existingCard.messageExample || [])],
    }
  }
}

function makeComputed<T extends keyof Card>(
  /*
  Function used to generate Computed values, with an optional sanitize function
  */
  key: T,
  transform?: (input: string) => string,
) {
  return computed({
    get: () => {
      return card.value[key] ?? ''
    },
    set: (val: string) => { // Set,
      const input = val.trim() // We first trim the value
      card.value[key] = (input.length > 0
        ? (transform ? transform(input) : input) // then potentially transform it
        : '') as Card[T]// or default to empty string value if nothing was given
    },
  })
}

const cardName = makeComputed('name', input => kebabcase(input))
const cardNickname = makeComputed('nickname')
const cardDescription = makeComputed('description')
const cardNotes = makeComputed('notes')

const cardPersonality = makeComputed('personality')
const cardScenario = makeComputed('scenario')
const cardGreetings = computed({
  get: () => card.value.greetings ?? [],
  set: (val: string[]) => {
    card.value.greetings = val || []
  },
})

const cardVersion = makeComputed('version')
const cardSystemPrompt = makeComputed('systemPrompt')
const cardPostHistoryInstructions = makeComputed('postHistoryInstructions')
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-100 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-100 m-0 max-h-[90vh] max-w-6xl w-[92vw] flex flex-col overflow-auto border border-neutral-200 rounded-xl bg-white p-5 shadow-xl 2xl:w-[60vw] lg:w-[80vw] md:w-[85vw] xl:w-[70vw] -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-800 sm:p-6">
        <div class="w-full flex flex-col gap-5">
          <DialogTitle text-2xl font-normal class="from-primary-500 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent">
            {{ t("settings.pages.card.edit.title") }}
          </DialogTitle>

          <!-- Dialog tabs -->
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
                  <span class="inline-flex items-center gap-1.5">
                    <span class="h-4 w-4 flex items-center justify-center">
                      <span :class="tab.icon" />
                    </span>
                    <span>{{ tab.label }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Error message -->
          <div v-if="showError" class="mt-2 border border-red-200 rounded-lg bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            <div class="flex">
              <div class="flex-shrink-0">
                <span i-solar:alert-circle-bold-duotone class="h-5 w-5" />
              </div>
              <div class="ml-3">
                <p>{{ errorMessage }}</p>
              </div>
            </div>
          </div>

          <!-- Tab contents -->
          <div class="grid grid-cols-1 mt-2 gap-6 sm:grid-cols-2">
            <!-- Identity Tab -->
            <div v-if="activeTab === 'identity'" class="space-y-6">
              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.creation.name') }}
                </label>
                <div class="relative rounded-md shadow-sm">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500 dark:text-neutral-400">
                    <span i-solar:user-bold-duotone class="h-5 w-5" />
                  </div>
                  <input
                    v-model="cardName"
                    type="text"
                    class="h-10 w-full border-neutral-300 rounded-md bg-white px-10 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.creation.nickname') }}
                </label>
                <div class="relative rounded-md shadow-sm">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500 dark:text-neutral-400">
                    <span i-solar:user-circle-bold-duotone class="h-5 w-5" />
                  </div>
                  <input
                    v-model="cardNickname"
                    type="text"
                    class="h-10 w-full border-neutral-300 rounded-md bg-white px-10 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.creation.version') }}
                </label>
                <div class="relative rounded-md shadow-sm">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500 dark:text-neutral-400">
                    <span i-solar:version-bold-duotone class="h-5 w-5" />
                  </div>
                  <input
                    v-model="cardVersion"
                    type="text"
                    class="h-10 w-full border-neutral-300 rounded-md bg-white px-10 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                </div>
              </div>

              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.creation.description') }}
                </label>
                <textarea
                  v-model="cardDescription"
                  class="min-h-[100px] w-full resize-y border-neutral-300 rounded-md bg-white p-3 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.creator_notes') }}
                </label>
                <textarea
                  v-model="cardNotes"
                  class="min-h-[100px] w-full resize-y border-neutral-300 rounded-md bg-white p-3 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            <!-- Behavior Tab -->
            <div v-if="activeTab === 'behavior'" class="space-y-6">
              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.personality') }}
                </label>
                <textarea
                  v-model="cardPersonality"
                  class="min-h-[120px] w-full resize-y border-neutral-300 rounded-md bg-white p-3 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.scenario') }}
                </label>
                <textarea
                  v-model="cardScenario"
                  class="min-h-[120px] w-full resize-y border-neutral-300 rounded-md bg-white p-3 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <FieldValues v-model="cardGreetings" :label="t('settings.pages.card.creation.greetings')" :description="t('settings.pages.card.creation.fields_info.greetings')" />
            </div>

            <!-- Settings Tab -->
            <div v-if="activeTab === 'settings'" class="space-y-6">
              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.systemprompt') }}
                </label>
                <textarea
                  v-model="cardSystemPrompt"
                  class="min-h-[150px] w-full resize-y border-neutral-300 rounded-md bg-white p-3 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div class="space-y-1.5">
                <label class="block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                  {{ t('settings.pages.card.posthistoryinstructions') }}
                </label>
                <textarea
                  v-model="cardPostHistoryInstructions"
                  class="min-h-[150px] w-full resize-y border-neutral-300 rounded-md bg-white p-3 text-sm dark:border-neutral-600 focus:border-primary-500 dark:bg-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          <!-- Dialog footer -->
          <div class="mt-6 flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              :label="t('settings.pages.card.cancel')"
              @click="modelValue = false"
            />
            <Button
              variant="primary"
              :label="t('settings.pages.card.save')"
              @click="saveCard(card)"
            />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
