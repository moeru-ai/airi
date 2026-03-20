<script setup lang="ts">
import type { SpeechCapabilitiesInfo } from '@proj-airi/stage-ui/stores/providers'

import { FieldInput } from '@proj-airi/ui'

defineProps<{
  actingModelExpressionOptions: string[]
  actingGroupedExpressionTags: { category: string, tags: { tag: string, description?: string }[] }[]
  actingMannerismOptions: NonNullable<SpeechCapabilitiesInfo['mannerisms']>
  actingSpeechCapabilitiesLoading: boolean
  selectedSpeechProviderLabel: string
  isVrmaExpression: (name: string) => boolean
  insertModelExpression: (name: string) => void
  insertSpeechTag: (tag: string, description?: string) => void
  insertSpeechMannerism: (id: string) => void
}>()
const selectedActingModelExpressionPrompt = defineModel<string>('selectedActingModelExpressionPrompt', { required: true })
const selectedActingSpeechExpressionPrompt = defineModel<string>('selectedActingSpeechExpressionPrompt', { required: true })
const selectedActingSpeechMannerismPrompt = defineModel<string>('selectedActingSpeechMannerismPrompt', { required: true })
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3 text-sm text-neutral-500">
      Author helper-backed prompt instructions for model expressions, speech tags, and speech mannerisms. These fields are injected into AIRI's prompt builder, while the helpers below reflect the currently loaded model and selected speech provider.
    </p>

    <div class="input-list ml-auto mr-auto w-90% flex flex-col gap-8">
      <div class="border border-neutral-200 rounded-xl p-4 dark:border-neutral-700">
        <FieldInput
          v-model="selectedActingModelExpressionPrompt"
          label="ACT / Model Expressions"
          description="Teach AIRI how to emit ACT tokens for avatar expressions and motion cues."
          :single-line="false"
        />
        <div class="mt-3 flex flex-col gap-2">
          <div class="text-xs text-neutral-500">
            Available model expressions
            <span v-if="actingModelExpressionOptions.length">({{ actingModelExpressionOptions.length }})</span>
          </div>
          <div v-if="actingModelExpressionOptions.length" class="flex flex-wrap gap-2">
            <button
              v-for="name in actingModelExpressionOptions"
              :key="name"
              class="flex items-center gap-1 border border-neutral-200 rounded-full px-3 py-1 text-xs transition-colors dark:border-neutral-700 hover:border-primary-400 hover:text-primary-500"
              :class="[
                isVrmaExpression(name)
                  ? 'bg-primary-50/50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300 border-primary-200/50'
                  : 'text-neutral-600 dark:text-neutral-300',
              ]"
              @click="insertModelExpression(name)"
            >
              <div v-if="isVrmaExpression(name)" class="i-solar:running-bold-duotone text-[10px]" />
              {{ name }}
            </button>
          </div>
          <div v-else class="text-xs text-neutral-400">
            No VRM expression list is currently available. Load a VRM model on stage to surface expression helpers here.
          </div>
        </div>
      </div>

      <div class="border border-neutral-200 rounded-xl p-4 dark:border-neutral-700">
        <FieldInput
          v-model="selectedActingSpeechExpressionPrompt"
          label="Speech Tags / Audio Expressions"
          description="Teach AIRI how to use provider-side vocal tags when the selected speech provider supports them."
          :single-line="false"
        />
        <div class="mt-3 flex flex-col gap-3">
          <div class="text-xs text-neutral-500">
            Speech tag helpers for provider
            <span class="text-neutral-700 font-medium dark:text-neutral-200">{{ selectedSpeechProviderLabel }}</span>
          </div>
          <div v-if="actingSpeechCapabilitiesLoading" class="text-xs text-neutral-400">
            Loading speech capability helpers...
          </div>
          <div v-else-if="actingGroupedExpressionTags.length" class="flex flex-col gap-3">
            <div v-for="group in actingGroupedExpressionTags" :key="group.category" class="flex flex-col gap-2">
              <div class="text-xs text-neutral-500 tracking-wide uppercase">
                {{ group.category }}
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="tag in group.tags"
                  :key="`${group.category}:${tag.tag}`"
                  class="border border-neutral-200 rounded-full px-3 py-1 text-xs text-neutral-600 transition-colors dark:border-neutral-700 hover:border-primary-400 dark:text-neutral-300 hover:text-primary-500"
                  :title="tag.description || tag.tag"
                  @click="insertSpeechTag(tag.tag, tag.description)"
                >
                  [{{ tag.tag }}]
                </button>
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-neutral-400">
            The selected speech provider does not currently expose expression-tag helpers.
          </div>
        </div>
      </div>

      <div class="border border-neutral-200 rounded-xl p-4 dark:border-neutral-700">
        <FieldInput
          v-model="selectedActingSpeechMannerismPrompt"
          label="Speech Mannerisms"
          description="Teach AIRI when to use provider-supported speech mannerisms without exposing the raw transformation internals."
          :single-line="false"
        />
        <div class="mt-3 flex flex-col gap-3">
          <div class="text-xs text-neutral-500">
            Insert helper blurbs from the current speech provider
          </div>
          <div v-if="actingMannerismOptions.length" class="flex flex-wrap gap-2">
            <button
              v-for="item in actingMannerismOptions"
              :key="item.id"
              class="border border-neutral-200 rounded-full px-3 py-1 text-xs text-neutral-600 transition-colors dark:border-neutral-700 hover:border-primary-400 dark:text-neutral-300 hover:text-primary-500"
              :title="item.description || item.label"
              @click="insertSpeechMannerism(item.id)"
            >
              {{ item.label }}
            </button>
          </div>
          <div v-else class="text-xs text-neutral-400">
            No provider-side mannerism helpers are currently available for this speech provider.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
