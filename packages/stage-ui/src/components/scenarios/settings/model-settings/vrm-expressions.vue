<script setup lang="ts">
import { useModelStore } from '@proj-airi/stage-ui-three'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { Container } from '../../../data-pane'

const modelStore = useModelStore()
const { availableExpressions, activeExpressions, emotionMappings, favoriteExpression } = storeToRefs(modelStore)

// Categorize: Presets have mixed case (e.g., "happy", "MouthLeft"), Custom are all lowercase
const presets = computed(() =>
  availableExpressions.value.filter(e => e !== e.toLowerCase()),
)
const custom = computed(() =>
  availableExpressions.value.filter(e => e === e.toLowerCase()),
)

const hasExpressions = computed(() => availableExpressions.value.length > 0)

// === Layer 1: Toggle ===
function toggleExpression(name: string) {
  const current = activeExpressions.value[name] || 0
  const next = current > 0 ? 0 : 1
  activeExpressions.value = { ...activeExpressions.value, [name]: next }
}

function resetAll() {
  const reset: Record<string, number> = {}
  for (const name of availableExpressions.value) {
    reset[name] = 0
  }
  activeExpressions.value = reset
}

function isActive(name: string): boolean {
  return (activeExpressions.value[name] || 0) > 0
}

// === Layer 3: ACT Mapping ===
const ACT_EMOTIONS = ['happy', 'sad', 'angry', 'surprised', 'neutral', 'think', 'cool'] as const

const mappingTarget = ref<string | null>(null) // Which VRM expression we're mapping
let longPressTimer: ReturnType<typeof setTimeout> | null = null

function getMappedEmotion(name: string): string | undefined {
  return emotionMappings.value[name]
}

function onPointerDown(name: string) {
  longPressTimer = setTimeout(() => {
    mappingTarget.value = name
    longPressTimer = null
  }, 500)
}

function onPointerUp(name: string) {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
    // Short press — toggle
    toggleExpression(name)
  }
  // If longPressTimer is already null, the long press fired (modal opened)
}

function onPointerLeave() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function assignMapping(actEmotion: string) {
  if (!mappingTarget.value)
    return
  emotionMappings.value = { ...emotionMappings.value, [mappingTarget.value]: actEmotion }
  mappingTarget.value = null
}

function clearMapping() {
  if (!mappingTarget.value)
    return
  const updated = { ...emotionMappings.value }
  delete updated[mappingTarget.value]
  emotionMappings.value = updated
  mappingTarget.value = null
}

function toggleFavorite() {
  if (!mappingTarget.value)
    return
  if (favoriteExpression.value === mappingTarget.value) {
    favoriteExpression.value = ''
  }
  else {
    favoriteExpression.value = mappingTarget.value
  }
  mappingTarget.value = null
}

function closeModal() {
  mappingTarget.value = null
}

const ACT_EMOJI: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  surprised: '😲',
  neutral: '😐',
  think: '🤔',
  cool: '😎',
}
</script>

<template>
  <Container
    title="Expressions"
    icon="i-solar:emoji-funny-square-bold-duotone"
    :expand="false"
    :class="[
      'rounded-xl',
      'bg-white/80 dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <div v-if="!hasExpressions" class="p-2 text-xs text-neutral-400">
      No expressions available. Load a VRM model first.
    </div>
    <template v-else>
      <div class="flex items-center justify-between px-2 pt-1">
        <span class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ availableExpressions.length }} expressions · hold to map
        </span>
        <button
          class="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 transition-colors dark:bg-neutral-800 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700"
          @click="resetAll"
        >
          Reset All
        </button>
      </div>

      <!-- Presets -->
      <div v-if="presets.length > 0" class="px-2 pt-2">
        <div class="mb-1 text-xs text-neutral-500 font-medium dark:text-neutral-400">
          Presets ({{ presets.length }})
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="name in presets"
            :key="name"
            :class="[
              'relative rounded-md px-2 py-1 text-xs transition-all duration-150',
              'border border-solid select-none',
              isActive(name)
                ? 'bg-primary-500/20 border-primary-400 text-primary-600 dark:text-primary-300 font-medium'
                : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700',
            ]"
            @pointerdown.prevent="onPointerDown(name)"
            @pointerup="onPointerUp(name)"
            @pointerleave="onPointerLeave()"
          >
            <span v-if="favoriteExpression === name" class="mr-0.5 text-[10px]">⭐</span>
            {{ name }}
            <span
              v-if="getMappedEmotion(name)"
              class="ml-0.5 text-[10px] opacity-70"
            >{{ ACT_EMOJI[getMappedEmotion(name)!] || '🔗' }}</span>
          </button>
        </div>
      </div>

      <!-- Custom Extensions -->
      <div v-if="custom.length > 0" class="px-2 py-2">
        <div class="mb-1 text-xs text-neutral-500 font-medium dark:text-neutral-400">
          Custom Extensions ({{ custom.length }})
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="name in custom"
            :key="name"
            :class="[
              'relative rounded-md px-2 py-1 text-xs transition-all duration-150',
              'border border-solid select-none',
              isActive(name)
                ? 'bg-lime-500/20 border-lime-400 text-lime-600 dark:text-lime-300 font-medium'
                : 'bg-neutral-50 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700',
            ]"
            @pointerdown.prevent="onPointerDown(name)"
            @pointerup="onPointerUp(name)"
            @pointerleave="onPointerLeave()"
          >
            <span v-if="favoriteExpression === name" class="mr-0.5 text-[10px]">⭐</span>
            {{ name }}
            <span
              v-if="getMappedEmotion(name)"
              class="ml-0.5 text-[10px] opacity-70"
            >{{ ACT_EMOJI[getMappedEmotion(name)!] || '🔗' }}</span>
          </button>
        </div>
      </div>
    </template>
  </Container>

  <!-- ACT Mapping Modal -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="mappingTarget"
        class="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="closeModal"
      >
        <div
          class="w-72 border border-neutral-200 rounded-xl border-solid bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div class="mb-3 text-center">
            <div class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
              Map Expression
            </div>
            <div class="mt-1 rounded-md bg-neutral-100 px-3 py-1 text-xs text-primary-500 font-mono dark:bg-neutral-800">
              {{ mappingTarget }}
            </div>
            <div class="mt-1 text-[11px] text-neutral-400">
              to an ACT emotion slot
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="emotion in ACT_EMOTIONS"
              :key="emotion"
              :class="[
                'rounded-lg px-3 py-2 text-sm transition-all duration-150',
                'border border-solid',
                getMappedEmotion(mappingTarget!) === emotion
                  ? 'bg-primary-500/20 border-primary-400 text-primary-600 dark:text-primary-300 font-medium'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700',
              ]"
              @click="assignMapping(emotion)"
            >
              {{ ACT_EMOJI[emotion] }} {{ emotion }}
            </button>
          </div>

          <!-- Favorite Toggle -->
          <button
            :class="[
              'mt-3 w-full rounded-lg px-3 py-2 text-sm transition-all duration-150',
              'border border-solid',
              favoriteExpression === mappingTarget
                ? 'bg-amber-500/20 border-amber-400 text-amber-600 dark:text-amber-300 font-medium'
                : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700',
            ]"
            @click="toggleFavorite"
          >
            ⭐ {{ favoriteExpression === mappingTarget ? 'Remove Favorite' : 'Set as Favorite' }}
          </button>

          <div class="mt-3 flex gap-2">
            <button
              class="flex-1 border border-red-300 rounded-lg border-solid bg-red-50 px-3 py-1.5 text-xs text-red-600 transition-colors dark:border-red-800 dark:bg-red-900/30 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/50"
              @click="clearMapping"
            >
              Clear Mapping
            </button>
            <button
              class="flex-1 border border-neutral-200 rounded-lg border-solid bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600 transition-colors dark:border-neutral-700 dark:bg-neutral-800 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
              @click="closeModal"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
