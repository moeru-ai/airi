<script setup lang="ts">
import type { Card } from '@proj-airi/ccc'

import kebabcase from '@stdlib/string-base-kebabcase'

import { Button } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { FieldInput, FieldValues } from '@proj-airi/ui'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  modelValue: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const modelValue = defineModel<boolean>()

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

  if (!(rawCard.name!.length > 0)) { // ! is used, since a default value is provided, and computed values passed to v-model should never be undefined
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

  cardStore.addCard(rawCard)
  modelValue.value = false // Close this
  return true
}

// Cards data holders :

const card = ref<Card>({
  name: t('settings.pages.card.creation.defaults.name'),
  nickname: undefined,
  version: '1.0',
  description: '',
  notes: undefined,
  personality: t('settings.pages.card.creation.defaults.personality'),
  scenario: t('settings.pages.card.creation.defaults.scenario'),
  systemPrompt: t('settings.pages.card.creation.defaults.systemprompt'),
  postHistoryInstructions: t('settings.pages.card.creation.defaults.posthistoryinstructions'),
  greetings: [],
  messageExample: [],
})

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
            {{ t("settings.pages.card.create_card") }}
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
                  <div class="flex items-center gap-1">
                    <div :class="tab.icon" />
                    {{ tab.label }}
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Error div -->
          <div v-if="showError" class="w-full rounded-xl bg-red900">
            <p class="w-full p-4">
              {{ errorMessage }}
            </p>
          </div>

          <!-- Actual content -->
          <!-- Identity details -->
          <div v-if="activeTab === 'identity'" class="tab-content ml-auto mr-auto w-95%">
            <p class="mb-3">
              {{ t('settings.pages.card.creation.fields_info.subtitle') }}
            </p>

            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <FieldInput v-model="cardName" :label="t('settings.pages.card.creation.name')" :description="t('settings.pages.card.creation.fields_info.name')" :required="true" />
              <FieldInput v-model="cardNickname" :label="t('settings.pages.card.creation.nickname')" :description="t('settings.pages.card.creation.fields_info.nickname')" />
              <FieldInput v-model="cardDescription" :label="t('settings.pages.card.creation.description')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.description')" />
              <FieldInput v-model="cardNotes" :label="t('settings.pages.card.creator_notes')" :single-line="false" :description="t('settings.pages.card.creation.fields_info.notes')" />
            </div>
          </div>
          <!-- Behavior -->
          <div v-else-if="activeTab === 'behavior'" class="tab-content ml-auto mr-auto w-95%">
            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <FieldInput v-model="cardPersonality" :label="t('settings.pages.card.personality')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.personality')" />
              <FieldInput v-model="cardScenario" :label="t('settings.pages.card.scenario')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.scenario')" />
              <FieldValues v-model="cardGreetings" :label="t('settings.pages.card.creation.greetings')" :description="t('settings.pages.card.creation.fields_info.greetings')" />
            </div>
          </div>
          <!-- Settings -->
          <div v-else-if="activeTab === 'settings'" class="tab-content ml-auto mr-auto w-95%">
            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <FieldInput v-model="cardSystemPrompt" :label="t('settings.pages.card.systemprompt')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.systemprompt')" />
              <FieldInput v-model="cardPostHistoryInstructions" :label="t('settings.pages.card.posthistoryinstructions')" :single-line="false" :required="true" :description="t('settings.pages.card.creation.fields_info.posthistoryinstructions')" />
              <FieldInput v-model="cardVersion" :label="t('settings.pages.card.creation.version')" :required="true" :description="t('settings.pages.card.creation.fields_info.version')" />
            </div>
          </div>

          <div class="ml-auto mr-1 flex flex-row gap-2">
            <Button
              variant="secondary"
              icon="i-solar:undo-left-bold-duotone"
              :label="t('settings.pages.card.cancel')"
              :disabled="false"
              @click="modelValue = false"
            />
            <Button
              variant="primary"
              icon="i-solar:check-circle-bold-duotone"
              :label="t('settings.pages.card.creation.create')"
              :disabled="false"
              @click="saveCard(card)"
            />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.input-list > * {
    min-width: 45%;
  }

  @media (max-width: 641px) {
  .input-list * {
    min-width: unset;
    width: 100%;
  }
}
</style>
