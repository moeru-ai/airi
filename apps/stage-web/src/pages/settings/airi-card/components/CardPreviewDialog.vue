<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { Collapsable } from '@proj-airi/stage-ui/components'
import { useI18n } from 'vue-i18n'

import { highlightPlaceholders } from '../utils/card-parser'

defineProps<{
  isOpen: boolean
  cardId: string | null
  card: AiriCard | null
  isActive: boolean
}>()

const emit = defineEmits<{
  close: []
  activate: []
}>()
const { t } = useI18n()

function closeDialog() {
  emit('close')
}

function activateCard() {
  emit('activate')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        fixed inset-0 z-50
        bg="black/50"
        flex items-center justify-center
        @click="closeDialog"
      >
        <div
          max-w="3xl" w="90%" max-h="90vh" overflow-auto
          bg="white dark:neutral-900"
          rounded-lg p-6
          @click.stop
        >
          <div flex="~ row" mb-6 items-center justify-between>
            <h2 text-2xl font-semibold>
              {{ card?.name }}
            </h2>
            <button
              hover="bg-neutral-100 dark:bg-neutral-800"
              rounded-full p-2 transition
              @click="closeDialog"
            >
              <div i-solar:close-circle-bold text-xl />
            </button>
          </div>

          <div v-if="card" flex="~ col" gap-6>
            <div>
              <h3 mb-2 text-lg font-medium>
                {{ t('settings.pages.card.description') }}
              </h3>
              <div
                bg="neutral-50 dark:neutral-800"
                max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4
                v-html="highlightPlaceholders(card.description || t('settings.pages.card.no_description'))"
              />
            </div>

            <div v-if="card.prompt">
              <h3 mb-2 text-lg font-medium>
                {{ t('settings.pages.card.prompt') }}
              </h3>
              <div
                bg="neutral-50 dark:neutral-800"
                max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4 text-sm font-mono
                v-html="highlightPlaceholders(card.prompt)"
              />
            </div>

            <Collapsable v-if="card.tags && card.tags.length > 0" :label="t('settings.pages.card.tags')" :default="false">
              <div flex="~ row" flex-wrap gap-2 p-4>
                <span
                  v-for="tag in card.tags"
                  :key="tag"
                  text="sm neutral-700 dark:neutral-300"
                  bg="neutral-100 dark:neutral-800"
                  rounded-full
                  px-3 py-1
                >
                  {{ tag }}
                </span>
              </div>
            </Collapsable>

            <!-- Extension Information -->
            <template v-if="card.extensions">
              <!-- Scenario Information -->
              <Collapsable v-if="card.extensions.scenario" :label="t('settings.pages.card.scenario')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4
                >
                  {{ card.extensions.scenario }}
                </div>
              </Collapsable>

              <!-- Personality Information -->
              <Collapsable v-if="card.extensions.personality" :label="t('settings.pages.card.personality')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4
                >
                  {{ card.extensions.personality }}
                </div>
              </Collapsable>

              <!-- First Message -->
              <Collapsable v-if="card.extensions?.first_mes" :label="t('settings.pages.card.first_message')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4 text-sm font-mono
                  v-html="highlightPlaceholders(String(card.extensions?.first_mes || ''))"
                />
              </Collapsable>

              <!-- Creator Notes -->
              <Collapsable v-if="card.extensions?.creator_notes" :label="t('settings.pages.card.creator_notes')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4
                >
                  {{ card.extensions?.creator_notes }}
                </div>
              </Collapsable>

              <!-- Post History Instructions -->
              <Collapsable v-if="card.extensions?.post_history_instructions" :label="t('settings.pages.card.post_instructions')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4 text-sm font-mono
                  v-html="highlightPlaceholders(String(card.extensions?.post_history_instructions || ''))"
                />
              </Collapsable>

              <!-- Alternate Greetings -->
              <Collapsable v-if="card.extensions?.alternate_greetings && Array.isArray(card.extensions.alternate_greetings) && card.extensions.alternate_greetings.length > 0" :label="t('settings.pages.card.templates')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4 text-sm font-mono
                >
                  <div v-for="(greeting, index) in (card.extensions?.alternate_greetings || [])" :key="index" class="mb-2 pb-2" border="b neutral-200 dark:neutral-700">
                    <p class="mb-1">
                      模板 #{{ index + 1 }}
                    </p>
                    <p v-html="highlightPlaceholders(String(greeting))" />
                  </div>
                </div>
              </Collapsable>

              <!-- Character Book -->
              <Collapsable v-if="card.extensions?.character_book" :label="t('settings.pages.card.character_book')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4 text-xs font-mono
                >
                  {{ JSON.stringify(card.extensions?.character_book, null, 2) }}
                </div>
              </Collapsable>

              <!-- Nickname (CCv3) -->
              <Collapsable v-if="card.extensions?.nickname" :label="t('settings.pages.card.nickname')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4 text-xs font-mono
                >
                  {{ card.extensions?.nickname }}
                </div>
              </Collapsable>

              <!-- Extension Properties -->
              <Collapsable v-if="Object.keys(card.extensions).filter(k => !['personality', 'scenario', 'first_mes', 'creator_notes', 'post_history_instructions', 'alternate_greetings', 'character_book', 'nickname'].includes(k)).length > 0" :label="t('settings.pages.card.extensions')" :default="false">
                <div
                  bg="neutral-50 dark:neutral-800"
                  max-h-60 overflow-auto whitespace-pre-wrap rounded-md p-4 text-xs font-mono
                >
                  {{ JSON.stringify(
                    Object.fromEntries(
                      Object.entries(card.extensions).filter(
                        ([k]) => !['personality', 'scenario', 'first_mes', 'creator_notes', 'post_history_instructions', 'alternate_greetings', 'character_book', 'nickname'].includes(k),
                      ),
                    ),
                    null,
                    2,
                  ) }}
                </div>
              </Collapsable>
            </template>

            <!-- Other Information -->
            <div>
              <h3 mb-2 text-lg font-medium>
                {{ t('settings.pages.card.info') }}
              </h3>
              <div grid="~ cols-2 gap-4">
                <div>
                  <p text="sm neutral-500">
                    {{ t('settings.pages.card.version') }}
                  </p>
                  <p>{{ card.version || '1.0.0' }}</p>
                </div>
                <div>
                  <p text="sm neutral-500">
                    {{ t('settings.pages.card.consciousness_model') }}
                  </p>
                  <p>{{ card.models?.consciousness || 'gpt-4o' }}</p>
                </div>
              </div>
            </div>

            <!-- Action Button -->
            <div flex="~ row" mt-4 justify-end gap-4>
              <button
                bg="neutral-100 dark:neutral-800"
                hover="bg-neutral-200 dark:bg-neutral-700"
                rounded-lg px-6 py-2 transition
                @click="closeDialog"
              >
                {{ t('settings.pages.card.close') }}
              </button>
              <button
                v-if="!isActive"
                bg="primary-500"
                hover="bg-primary-600"
                text="white"
                rounded-lg px-6 py-2 transition
                @click="activateCard"
              >
                {{ t('settings.pages.card.activate') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
