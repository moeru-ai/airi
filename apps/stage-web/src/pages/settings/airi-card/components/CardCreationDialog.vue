<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue'
import { computed, ref } from 'vue'

interface Props {
  modelValue: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

// const { t } = useI18n()
const _cardStore = useAiriCardStore()

// Get character settings
/* const characterSettings = computed(() => {
  if (!selectedCard.value)
    return {}

  return {
    personality: selectedCard.value.personality,
    scenario: selectedCard.value.scenario,
    systemPrompt: selectedCard.value.systemPrompt,
    postHistoryInstructions: selectedCard.value.postHistoryInstructions,
  }
}) */

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
  { id: 'character', label: 'Character', icon: 'i-solar:emoji-funny-square-bold-duotone' },
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
          <!-- Character details -->
          <div v-if="activeTab === 'character'">
            <p>Characters</p>
          </div>
          <!-- Other -->
          <div v-else-if="activeTab === 'other'">
            <p>other</p>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
