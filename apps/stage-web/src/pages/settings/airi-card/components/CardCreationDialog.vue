<script setup lang="ts">
import type { Card } from '@proj-airi/ccc'

import { Button } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue'
import { computed, ref } from 'vue'

import TextInput from './moveMeLaterInput.vue'

interface Props {
  modelValue: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

// const { t } = useI18n() //TODO
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
  { id: 'identity', label: 'Identity', icon: 'i-solar:emoji-funny-square-bold-duotone' },
  { id: 'behavior', label: 'Behavior', icon: 'i-solar:chat-round-line-bold-duotone' },
  { id: 'settings', label: 'Settings', icon: 'i-solar:settings-bold-duotone' },
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

// Save built Cards :
function saveCard(card: Card): string {
  const newId: string = cardStore.addCard(card)
  return newId
}

// Cards data holders :

const card = ref<Card>({
  name: 'Name',
  nickname: undefined,
  version: '1.0',
  description: undefined,
  notes: undefined,
  personality: undefined,
  scenario: undefined,
  systemPrompt: 'System prompt',
  postHistoryInstructions: 'Post history Instructions',
  greetings: [],
  messageExample: [],
})

function makeComputed<T extends keyof Card>(
  /*
  Function used to generate Computed values, with an optional sanitize function
  */
  key: T,
  fallback?: string | string[],
  transform?: (input: string) => string | string[],
) {
  return computed({
    get: () => {
      const raw = card.value[key] // We get the value from our card
      return Array.isArray(raw) // Is it an Array ?
        ? raw.join('\n') // If yes, we can transform it to String and return
        : raw ?? fallback ?? '' // Else, that's a String or undefined
    },
    set: (val: string) => { // Set,
      const input = val.trim() // We first trim the value
      card.value[key] = input.length > 0
        ? (transform ? transform(input) : input) // then potentially transform it
        : fallback // or default to fallback value if nothing was given
    },
  })
}

const cardName = makeComputed('name', '', input => input.split(' ').map(e => e.charAt(0).toUpperCase() + e.slice(1).toLowerCase()).join(' '))
const cardNickname = makeComputed('nickname')
const cardDescription = makeComputed('description')
const cardNotes = makeComputed('notes')

const cardPersonality = makeComputed('personality', 'You are a regular human, curious about everything.')
const cardScenario = makeComputed('scenario', 'You recently woke up and forgot everything about your previous life.')
const cardGreetings = makeComputed('greetings', [], input => input.split('\n'))
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal>
      <DialogOverlay class="data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut fixed inset-0 z-100 bg-black/50 backdrop-blur-sm" />
      <DialogContent class="data-[state=open]:animate-contentShow data-[state=closed]:animate-contentHide fixed left-1/2 top-1/2 z-100 m-0 max-h-[90vh] max-w-6xl w-[92vw] flex flex-col overflow-auto border border-neutral-200 rounded-xl bg-white p-5 shadow-xl 2xl:w-[60vw] lg:w-[80vw] md:w-[85vw] xl:w-[70vw] -translate-x-1/2 -translate-y-1/2 dark:border-neutral-700 dark:bg-neutral-800 sm:p-6">
        <div class="w-full flex flex-col gap-5">
          <DialogTitle text-2xl font-bold class="from-primary-500 to-primary-400 bg-gradient-to-r bg-clip-text text-transparent">
            Create a new Card
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

          <!-- Actual content -->
          <!-- Identity details -->
          <div v-if="activeTab === 'identity'" class="tab-content ml-auto mr-auto w-95%">
            <p>TODO</p>

            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <TextInput v-model="cardName" label="Name" :required="true" />
              <TextInput v-model="cardNickname" label="Nickname" />
              <TextInput v-model="cardDescription" label="Description" :long="true" />
              <TextInput v-model="cardNotes" label="Personal notes" :long="true" />
            </div>
          </div>
          <!-- Behavior -->
          <div v-else-if="activeTab === 'behavior'">
            <p>TODO</p>

            <div class="input-list ml-auto mr-auto w-90% flex flex-row flex-wrap justify-center gap-8">
              <TextInput v-model="cardPersonality" label="Personality" :long="true" />
              <TextInput v-model="cardScenario" label="Scenario" :long="true" />
              <TextInput v-model="cardGreetings" label="Greetings, one per line" :long="true" />
            </div>
          </div>
          <Button
            variant="primary"
            icon="i-solar:check-circle-bold-duotone"
            label="Create"
            :disabled="false"
            @click="saveCard(card)"
          />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.input-list *{
    min-width: 45%;
  }

  @media (max-width: 641px) {
  .input-list *{
    min-width: unset;
    width: 100%;
  }
}
</style>
