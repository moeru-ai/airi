<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import Range from './Form/Range/Range.vue'

import { useCharacterPromptStore } from '../composables/useCharacterPrompt'

const characterPrompt = useCharacterPromptStore()
const { currentEmotion, currentContext, emotions, contexts, examples } = storeToRefs(characterPrompt)
const activeTemplate = ref('default')

// Helper function that safely gets emotion description
function getEmotionDescription() {
  const emotion = currentEmotion.value
  if (['happy', 'curious', 'thoughtful', 'playful', 'annoyed', 'excited'].includes(emotion)) {
    return emotions.value[emotion as keyof typeof emotions.value]
  }
  return ''
}

// Helper function that safely gets context description
function getContextDescription() {
  const context = currentContext.value
  if (['casual', 'tech', 'philosophical', 'anime', 'custom'].includes(context)) {
    return contexts.value[context as keyof typeof contexts.value]
  }
  return ''
}

// Helper function that safely gets example description
function getExampleDescription() {
  const context = currentContext.value
  if (['casual', 'tech', 'philosophical', 'anime'].includes(context)) {
    return examples.value[context as keyof typeof examples.value]
  }
  return ''
}

// Update emotion description
function updateEmotionDescription(value: string) {
  const emotion = currentEmotion.value
  if (['happy', 'curious', 'thoughtful', 'playful', 'annoyed', 'excited'].includes(emotion)) {
    emotions.value[emotion as keyof typeof emotions.value] = value
  }
}

// Update context description
function updateContextDescription(value: string) {
  const context = currentContext.value
  if (['casual', 'tech', 'philosophical', 'anime', 'custom'].includes(context)) {
    contexts.value[context as keyof typeof contexts.value] = value
  }
}

// Update example description
function updateExampleDescription(value: string) {
  const context = currentContext.value
  if (['casual', 'tech', 'philosophical', 'anime'].includes(context)) {
    examples.value[context as keyof typeof examples.value] = value
  }
}

function estimateTokens(text: string) {
  return characterPrompt.estimateTokens(text || '')
}

function applyTemplate(template: string) {
  characterPrompt.applyTemplate(template)
  activeTemplate.value = template
}
</script>

<template>
  <div class="panel rounded-lg bg-white shadow">
    <div class="panel-header flex items-center justify-between rounded-t-lg bg-primary p-3 text-sm text-white font-normal">
      Character Configuration
    </div>

    <div class="panel-body max-h-[calc(100vh-13rem)] overflow-y-auto p-4">
      <!-- Core Identity -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-normal">
          Core Identity
        </h3>

        <div class="flex flex-col gap-1">
          <label for="char-name" class="text-sm text-dark">Name</label>
          <input
            id="char-name"
            v-model="characterPrompt.coreIdentity.name"
            type="text"
            class="border border-gray-200 rounded-md p-2 text-sm font-sans"
          >
        </div>

        <div class="flex flex-col gap-1">
          <label for="char-age" class="text-sm text-dark">Age</label>
          <input
            id="char-age"
            v-model="characterPrompt.coreIdentity.age"
            type="text"
            class="border border-gray-200 rounded-md p-2 text-sm font-sans"
          >
        </div>

        <div class="flex flex-col gap-1">
          <label for="char-essence" class="flex justify-between text-sm text-dark">
            <span>Essence</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-normal">{{ estimateTokens(characterPrompt.coreIdentity.essence) }}</span>
            </span>
          </label>
          <textarea
            id="char-essence"
            v-model="characterPrompt.coreIdentity.essence"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
          />
        </div>
      </div>

      <!-- Personality Traits -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-normal">
          Personality Traits
        </h3>

        <label class="flex flex-col gap-1 text-sm text-dark">
          <div flex justify-between>
            <span>Playfulness</span>
            <span class="w-12 text-right text-xs text-gray font-mono">{{ characterPrompt.traits.playfulness }}</span>
          </div>
          <div flex>
            <Range
              v-model="characterPrompt.traits.playfulness"
              :min="0"
              :max="10"
              class="flex-1"
            />
          </div>
        </label>

        <label class="flex flex-col gap-1 text-sm text-dark">
          <div flex justify-between>
            <span>Curiosity</span>
            <span class="w-12 text-right text-xs text-gray font-mono">{{ characterPrompt.traits.curiosity }}</span>
          </div>
          <div flex>
            <Range
              v-model="characterPrompt.traits.curiosity"
              :min="0"
              :max="10"
              class="flex-1"
            />
          </div>
        </label>

        <label class="flex flex-col gap-1 text-sm text-dark">
          <div flex justify-between>
            <span>Thoughtfulness</span>
            <span class="w-12 text-right text-xs text-gray font-mono">{{ characterPrompt.traits.thoughtfulness }}</span>
          </div>
          <div flex>
            <Range
              v-model="characterPrompt.traits.thoughtfulness"
              :min="0"
              :max="10"
              class="flex-1"
            />
          </div>
        </label>

        <label class="flex flex-col gap-1 text-sm text-dark">
          <div flex justify-between>
            <span>Expressiveness</span>
            <span class="w-12 text-right text-xs text-gray font-mono">{{ characterPrompt.traits.expressiveness }}</span>
          </div>
          <div flex>
            <Range
              v-model="characterPrompt.traits.expressiveness"
              :min="0"
              :max="10"
              class="flex-1"
            />
          </div>
        </label>
      </div>

      <!-- Speech Patterns -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-normal">
          Speech Patterns
        </h3>

        <div class="flex flex-col gap-1">
          <label for="speech-patterns" class="flex justify-between text-sm text-dark">
            <span>Expression Style</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-normal">{{ estimateTokens(characterPrompt.speechPatterns) }}</span>
            </span>
          </label>
          <textarea
            id="speech-patterns"
            v-model="characterPrompt.speechPatterns"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
          />
        </div>
      </div>

      <!-- Emotional State -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-normal">
          Current Emotional State
        </h3>

        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="emotion in ['happy', 'curious', 'thoughtful', 'playful', 'annoyed', 'excited']"
            :key="emotion"
            class="flex flex-col cursor-pointer items-center justify-center gap-1 border border-gray-200 rounded-md bg-white p-2 text-sm transition-colors"
            :class="{ 'bg-primary-light border-primary font-normal shadow': characterPrompt.currentEmotion === emotion }"
            @click="characterPrompt.updateEmotion(emotion)"
          >
            <span class="text-lg">
              {{ emotion === 'happy' ? '😊'
                : emotion === 'curious' ? '🤔'
                  : emotion === 'thoughtful' ? '😌'
                    : emotion === 'playful' ? '😝'
                      : emotion === 'annoyed' ? '😤'
                        : emotion === 'excited' ? '🤩' : '😊' }}
            </span>
            <span>{{ emotion.charAt(0).toUpperCase() + emotion.slice(1) }}</span>
          </button>
        </div>

        <div class="flex flex-col gap-1">
          <label for="emotion-description" class="flex justify-between text-sm text-dark">
            <span>Emotion Description</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-normal">
                {{ estimateTokens(getEmotionDescription()) }}
              </span>
            </span>
          </label>
          <textarea
            id="emotion-description"
            :value="getEmotionDescription()"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
            @input="e => updateEmotionDescription((e.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>

      <!-- Conversation Context -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-normal">
          Conversation Context
        </h3>

        <div class="flex flex-col gap-1">
          <label for="context-type" class="text-sm text-dark">Context Type</label>
          <select
            id="context-type"
            v-model="characterPrompt.currentContext"
            class="border border-gray-200 rounded-md p-2 text-sm font-sans"
          >
            <option value="casual">
              Casual Chat
            </option>
            <option value="tech">
              Technical Discussion
            </option>
            <option value="philosophical">
              Philosophical
            </option>
            <option value="anime">
              Anime & Games
            </option>
            <option value="custom">
              Custom
            </option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <label for="context-description" class="flex justify-between text-sm text-dark">
            <span>Context Description</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-normal">
                {{ estimateTokens(getContextDescription()) }}
              </span>
            </span>
          </label>
          <textarea
            id="context-description"
            :value="getContextDescription()"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
            @input="e => updateContextDescription((e.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>

      <!-- Response Format -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-normal">
          Response Format
        </h3>

        <div class="flex flex-col gap-1">
          <label for="response-format" class="flex justify-between text-sm text-dark">
            <span>Format Instructions</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-normal">{{ estimateTokens(characterPrompt.responseFormat) }}</span>
            </span>
          </label>
          <textarea
            id="response-format"
            v-model="characterPrompt.responseFormat"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
          />
        </div>
      </div>

      <!-- Example Response -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-normal">
          Example Response
        </h3>

        <div class="flex items-center">
          <label class="mr-2 text-sm text-dark">Include Example</label>
          <input
            id="include-example"
            v-model="characterPrompt.includeExample"
            type="checkbox"
          >
        </div>

        <div v-if="characterPrompt.includeExample" class="flex flex-col gap-1">
          <label for="example-response" class="flex justify-between text-sm text-dark">
            <span>Example</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-normal">
                {{ estimateTokens(getExampleDescription()) }}
              </span>
            </span>
          </label>
          <textarea
            id="example-response"
            :value="getExampleDescription()"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
            @input="e => updateExampleDescription((e.target as HTMLTextAreaElement).value)"
          />
        </div>
      </div>

      <!-- Preset Templates -->
      <div class="mt-4">
        <h3 class="mb-2 text-sm text-gray font-normal">
          Preset Templates
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="template in ['default', 'minimal', 'anime-lover', 'philosophical', 'tech-nerd']"
            :key="template"
            class="cursor-pointer border border-gray-200 rounded-md bg-white p-1.5 px-3 text-sm transition-colors"
            :class="{ 'bg-primary text-white border-primary-dark font-normal': activeTemplate === template }"
            @click="applyTemplate(template)"
          >
            {{ template.charAt(0).toUpperCase() + template.slice(1).replace('-', ' ') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
