<script setup lang="ts">
import { ref } from 'vue'

import { useCharacterPrompt } from '../composables/useCharacterPrompt'

const characterPrompt = useCharacterPrompt()
const activeTemplate = ref('default')

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
    <div class="panel-header bg-primary flex items-center justify-between rounded-t-lg p-3 text-sm text-white font-semibold">
      Character Configuration
    </div>

    <div class="panel-body max-h-[calc(100vh-13rem)] overflow-y-auto p-4">
      <!-- Core Identity -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-semibold">
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
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{{ estimateTokens(characterPrompt.coreIdentity.essence) }}</span>
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
        <h3 class="text-sm text-gray font-semibold">
          Personality Traits
        </h3>

        <div class="flex flex-col gap-1">
          <label for="playfulness" class="text-sm text-dark">Playfulness</label>
          <div class="flex items-center gap-2">
            <input
              id="playfulness"
              v-model.number="characterPrompt.traits.playfulness"
              type="range"
              min="0"
              max="10"
              class="flex-1"
            >
            <span class="w-12 text-right text-xs text-gray">{{ characterPrompt.traits.playfulness }}</span>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label for="curiosity" class="text-sm text-dark">Curiosity</label>
          <div class="flex items-center gap-2">
            <input
              id="curiosity"
              v-model.number="characterPrompt.traits.curiosity"
              type="range"
              min="0"
              max="10"
              class="flex-1"
            >
            <span class="w-12 text-right text-xs text-gray">{{ characterPrompt.traits.curiosity }}</span>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label for="thoughtfulness" class="text-sm text-dark">Thoughtfulness</label>
          <div class="flex items-center gap-2">
            <input
              id="thoughtfulness"
              v-model.number="characterPrompt.traits.thoughtfulness"
              type="range"
              min="0"
              max="10"
              class="flex-1"
            >
            <span class="w-12 text-right text-xs text-gray">{{ characterPrompt.traits.thoughtfulness }}</span>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label for="expressiveness" class="text-sm text-dark">Expressiveness</label>
          <div class="flex items-center gap-2">
            <input
              id="expressiveness"
              v-model.number="characterPrompt.traits.expressiveness"
              type="range"
              min="0"
              max="10"
              class="flex-1"
            >
            <span class="w-12 text-right text-xs text-gray">{{ characterPrompt.traits.expressiveness }}</span>
          </div>
        </div>
      </div>

      <!-- Speech Patterns -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-semibold">
          Speech Patterns
        </h3>

        <div class="flex flex-col gap-1">
          <label for="speech-patterns" class="flex justify-between text-sm text-dark">
            <span>Expression Style</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{{ estimateTokens(characterPrompt.speechPatterns) }}</span>
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
        <h3 class="text-sm text-gray font-semibold">
          Current Emotional State
        </h3>

        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="emotion in ['happy', 'curious', 'thoughtful', 'playful', 'annoyed', 'excited']"
            :key="emotion"
            class="flex flex-col cursor-pointer items-center justify-center gap-1 border border-gray-200 rounded-md bg-white p-2 text-sm transition-colors"
            :class="{ 'bg-primary-light border-primary font-semibold shadow': characterPrompt.currentEmotion === emotion }"
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
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{{ estimateTokens(characterPrompt.emotions[characterPrompt.currentEmotion]) }}</span>
            </span>
          </label>
          <textarea
            id="emotion-description"
            v-model="characterPrompt.emotions[characterPrompt.currentEmotion]"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
          />
        </div>
      </div>

      <!-- Conversation Context -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-semibold">
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
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{{ estimateTokens(characterPrompt.contexts[characterPrompt.currentContext]) }}</span>
            </span>
          </label>
          <textarea
            id="context-description"
            v-model="characterPrompt.contexts[characterPrompt.currentContext]"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
          />
        </div>
      </div>

      <!-- Response Format -->
      <div class="mb-6 flex flex-col gap-3">
        <h3 class="text-sm text-gray font-semibold">
          Response Format
        </h3>

        <div class="flex flex-col gap-1">
          <label for="response-format" class="flex justify-between text-sm text-dark">
            <span>Format Instructions</span>
            <span class="text-xs text-gray">
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{{ estimateTokens(characterPrompt.responseFormat) }}</span>
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
        <h3 class="text-sm text-gray font-semibold">
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
              Tokens: <span class="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">{{ estimateTokens(characterPrompt.examples[characterPrompt.currentContext]) }}</span>
            </span>
          </label>
          <textarea
            id="example-response"
            v-model="characterPrompt.examples[characterPrompt.currentContext]"
            class="min-h-16 resize-y border border-gray-200 rounded-md p-2 text-sm font-sans"
          />
        </div>
      </div>

      <!-- Preset Templates -->
      <div class="mt-4">
        <h3 class="mb-2 text-sm text-gray font-semibold">
          Preset Templates
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="template in ['default', 'minimal', 'anime-lover', 'philosophical', 'tech-nerd']"
            :key="template"
            class="cursor-pointer border border-gray-200 rounded-md bg-white p-1.5 px-3 text-sm transition-colors"
            :class="{ 'bg-primary text-white border-primary-dark font-semibold': activeTemplate === template }"
            @click="applyTemplate(template)"
          >
            {{ template.charAt(0).toUpperCase() + template.slice(1).replace('-', ' ') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
