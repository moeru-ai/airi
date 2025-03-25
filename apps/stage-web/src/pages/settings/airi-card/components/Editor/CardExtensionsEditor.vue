<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { Collapsable } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  card: AiriCard
}

interface Emits {
  (e: 'update:card', card: AiriCard): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

// Create a local copy of the card to avoid direct prop mutation
const localCard = computed({
  get: () => props.card,
  set: value => emit('update:card', value),
})

// Ensure extensions object exists
function ensureExtensions() {
  if (!localCard.value.extensions) {
    const updatedCard = { ...localCard.value, extensions: {} }
    emit('update:card', updatedCard)
    return updatedCard.extensions
  }
  return localCard.value.extensions
}

// Helper functions to safely get and set extension properties
function getExtensionProp(prop: string) {
  return localCard.value.extensions?.[prop]
}

function setExtensionProp(prop: string, value: any) {
  const extensions = ensureExtensions()
  const updatedExtensions = { ...extensions, [prop]: value }
  emit('update:card', { ...localCard.value, extensions: updatedExtensions })
}

// Add a new alternate greeting
function addAlternateGreeting() {
  const extensions = ensureExtensions()
  const alternateGreetings = Array.isArray(extensions.alternate_greetings)
    ? [...extensions.alternate_greetings, '']
    : ['']

  const updatedExtensions = { ...extensions, alternate_greetings: alternateGreetings }
  emit('update:card', { ...localCard.value, extensions: updatedExtensions })
}

// Remove an alternate greeting
function removeAlternateGreeting(index: number) {
  if (!localCard.value.extensions?.alternate_greetings)
    return

  const alternateGreetings = [...localCard.value.extensions.alternate_greetings]
  alternateGreetings.splice(index, 1)

  const updatedExtensions = { ...localCard.value.extensions, alternate_greetings: alternateGreetings }
  emit('update:card', { ...localCard.value, extensions: updatedExtensions })
}

// Update an alternate greeting
function updateAlternateGreeting(index: number, value: string) {
  if (!localCard.value.extensions?.alternate_greetings)
    return

  const alternateGreetings = [...localCard.value.extensions.alternate_greetings]
  alternateGreetings[index] = value

  const updatedExtensions = { ...localCard.value.extensions, alternate_greetings: alternateGreetings }
  emit('update:card', { ...localCard.value, extensions: updatedExtensions })
}
</script>

<template>
  <Collapsable
    :label="t('settings.pages.card.extensions')"
    :default="false"
    bg="white dark:neutral-900"
    border="~ neutral-200 dark:neutral-800"
    rounded-xl
    shadow="sm"
    overflow="hidden"
  >
    <div flex="~ col" gap-5 px-6 py-4>
      <div flex="~ row" mb-2>
        <span text="sm neutral-500">
          Extension settings allow for more precise control over AI behavior and response patterns
        </span>
      </div>

      <!-- Personality -->
      <div>
        <div flex="~ row" mb-2 items-center gap-1.5>
          <div i-solar:user-id-bold text="primary-500" text-sm />
          <label text="sm neutral-600 dark:neutral-400" font-medium>
            {{ t('settings.pages.card.personality') }}
          </label>
        </div>
        <textarea
          :value="getExtensionProp('personality')"
          class="textarea w-full"
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-lg
          px-4 py-2.5 rows="3"
          placeholder="Describe the personality and behavior of the AI"
          @input="e => setExtensionProp('personality', (e.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- Scenario -->
      <div>
        <div flex="~ row" mb-2 items-center gap-1.5>
          <div i-solar:map-bold text="primary-500" text-sm />
          <label text="sm neutral-600 dark:neutral-400" font-medium>
            {{ t('settings.pages.card.scenario') }}
          </label>
        </div>
        <textarea
          :value="getExtensionProp('scenario')"
          class="textarea w-full"
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-lg
          px-4 py-2.5 rows="3"
          placeholder="Describe the scenario or background story of the AI"
          @input="e => setExtensionProp('scenario', (e.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- First Message -->
      <div>
        <div flex="~ row" mb-2 items-center gap-1.5>
          <div i-solar:chat-round-dots-bold text="primary-500" text-sm />
          <label text="sm neutral-600 dark:neutral-400" font-medium>
            {{ t('settings.pages.card.first_message') }}
          </label>
        </div>
        <textarea
          :value="getExtensionProp('first_mes')"
          class="textarea w-full font-mono"
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-lg
          px-4 py-2.5 rows="3"
          text="sm"
          placeholder="The first greeting message of the AI"
          @input="e => setExtensionProp('first_mes', (e.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- Creator Notes -->
      <div>
        <div flex="~ row" mb-2 items-center gap-1.5>
          <div i-solar:notes-bold text="primary-500" text-sm />
          <label text="sm neutral-600 dark:neutral-400" font-medium>
            {{ t('settings.pages.card.creator_notes') }}
          </label>
        </div>
        <textarea
          :value="getExtensionProp('creator_notes')"
          class="textarea w-full"
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-lg
          px-4 py-2.5 rows="3"
          placeholder="Creator notes, record the design ideas and usage suggestions of the AI"
          @input="e => setExtensionProp('creator_notes', (e.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- Post History Instructions -->
      <div>
        <div flex="~ row" mb-2 items-center gap-1.5>
          <div i-solar:clipboard-list-bold text="primary-500" text-sm />
          <label text="sm neutral-600 dark:neutral-400" font-medium>
            {{ t('settings.pages.card.post_instructions') }}
          </label>
        </div>
        <textarea
          :value="getExtensionProp('post_history_instructions')"
          class="textarea w-full font-mono"
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-lg
          px-4 py-2.5 rows="3"
          text="sm"
          placeholder="Instructions appended to the history message"
          @input="e => setExtensionProp('post_history_instructions', (e.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- Alternate Greetings -->
      <div>
        <div flex="~ row" mb-2 items-center justify-between>
          <div flex="~ row" items-center gap-1.5>
            <div i-solar:chat-dots-bold text="primary-500" text-sm />
            <label text="sm neutral-600 dark:neutral-400" font-medium>
              {{ t('settings.pages.card.templates') }}
            </label>
          </div>
          <button
            bg="primary-50 dark:primary-900/30"
            hover="bg-primary-100 dark:primary-900/50"
            text="primary-600 dark:primary-400"
            flex="~ row" items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition
            @click="addAlternateGreeting"
          >
            <div i-solar:add-circle-bold text-sm />
            {{ t('common.add') }}
          </button>
        </div>

        <div
          v-if="!localCard.value.extensions?.alternate_greetings?.length"
          text="center sm neutral-500"
          border="~ dashed neutral-300 dark:neutral-700"
          rounded-lg py-6
        >
          No templates added yet
        </div>

        <div
          v-else
          flex="~ col"
          border="~ neutral-200 dark:neutral-700"
          max-h-80 gap-3 overflow-y-auto rounded-lg p-3 pr-1
        >
          <div
            v-for="(greeting, index) in localCard.value.extensions?.alternate_greetings"
            :key="index"
            relative
            bg="white dark:neutral-700"
            border="~ neutral-200 dark:neutral-600"
            rounded-lg
            overflow="hidden"
          >
            <div
              bg="neutral-50 dark:neutral-600"
              border-b="~ neutral-200 dark:neutral-600"
              flex="~ row"
              items-center justify-between px-3 py-1
            >
              <span text="xs neutral-500">Template #{{ index + 1 }}</span>
              <button
                text="red-500"
                hover="bg-red-50 dark:bg-red-900/30"
                rounded-full p-1 transition
                @click="removeAlternateGreeting(index)"
              >
                <div i-solar:trash-bin-trash-bold text-sm />
              </button>
            </div>
            <textarea
              :value="greeting"
              class="textarea w-full font-mono"
              bg="white dark:neutral-700"
              border="none"
              rows="2"
              text="sm"
              px-3
              py-2 placeholder="Enter template messages..."
              @input="e => updateAlternateGreeting(index, (e.target as HTMLTextAreaElement).value)"
            />
          </div>
        </div>
      </div>
    </div>
  </Collapsable>
</template>
