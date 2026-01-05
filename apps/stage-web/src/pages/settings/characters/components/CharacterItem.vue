<script setup lang="ts">
import type { Character } from '@proj-airi/stage-ui/types/character'

import { CursorFloating } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'

interface Props {
  character: Character
  isActive: boolean
  isSelected: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'select'): void
  (e: 'activate'): void
  (e: 'delete'): void
}>()

const i18n = computed(() => {
  // TODO: Use current locale
  if (!props.character.i18n?.length)
    return undefined
  return props.character.i18n.find(i => i.language === 'en') || props.character.i18n[0]
})

const name = computed(() => i18n.value?.name || 'Unknown')
const description = computed(() => i18n.value?.description || '')

const consciousnessModel = computed(() => {
  if (!props.character.capabilities)
    return '-'
  const cap = props.character.capabilities.find(c => c.type === 'llm')
  return cap?.config.llm?.model || '-'
})

const voiceModel = computed(() => {
  if (!props.character.capabilities)
    return '-'
  const cap = props.character.capabilities.find(c => c.type === 'tts')
  return cap?.config.tts?.voiceId || '-'
})
</script>

<template>
  <CursorFloating
    class="before:mask-image-[linear-gradient(120deg,white_100%)] before:bg-linear-to-r hover:before:bg-linear-to-r relative min-h-120px flex flex-col cursor-pointer overflow-hidden rounded-xl bg-neutral-200/50 drop-shadow-none transition-all duration-400 ease-in-out before:absolute before:inset-0 before:z-0 before:h-full before:w-25% dark:bg-neutral-800/50 before:from-primary-500/0 before:to-primary-500/0 before:opacity-0 active:drop-shadow-[0px_0px_0px_rgba(220,220,220,0.25)] hover:drop-shadow-[0px_4px_4px_rgba(220,220,220,0.4)] before:transition-all before:duration-400 before:ease-in-out before:content-empty dark:before:from-primary-400/0 hover:before:from-primary-500/20 hover:before:via-primary-500/10 dark:before:to-primary-400/0 hover:before:to-transparent hover:before:opacity-100 dark:hover:drop-shadow-none dark:hover:before:from-primary-400/20 dark:hover:before:via-primary-400/10 dark:hover:before:to-transparent"
    :class="[
      isSelected
        ? 'border-2 border-primary-400 dark:border-primary-600'
        : 'border-2 border-neutral-100 dark:border-neutral-800/25',
    ]"
    @click="emit('select')"
  >
    <!-- Card content -->
    <div
      class="after:bg-size-10px after:mask-image-[linear-gradient(165deg,white_30%,transparent_50%)] relative flex flex-1 flex-col justify-between gap-3 overflow-hidden rounded-lg bg-white p-5 text-primary-600/80 transition-all duration-400 ease-in-out after:absolute after:inset-0 after:z--2 after:h-full after:w-full dark:bg-neutral-900 dark:text-primary-300/80 after:transition-all after:duration-400 after:ease-in-out after:content-empty after:bg-dotted-[neutral-200/80] dark:after:bg-dotted-[primary-200/20] hover:after:bg-dotted-[primary-300/50]"
    >
      <!-- Card header (name and badge) -->
      <div class="z-1 flex items-start justify-between gap-2">
        <h3 class="flex-1 truncate text-lg font-normal">
          {{ name }}
        </h3>
        <div v-if="isActive" class="shrink-0 rounded-md bg-primary-100 p-1 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400">
          <div class="i-solar:check-circle-bold-duotone text-sm" />
        </div>
      </div>

      <!-- Card description -->
      <p v-if="description" class="line-clamp-3 min-h-40px flex-1 text-sm text-neutral-500 dark:text-neutral-400">
        {{ description }}
      </p>

      <!-- Card stats -->
      <div class="z-1 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <div>v{{ character.version }}</div>
        <div class="flex items-center gap-1.5">
          <div class="flex items-center gap-0.5">
            <div class="i-lucide:ghost text-xs" />
            <span>{{ consciousnessModel }}</span>
          </div>
          <div class="flex items-center gap-0.5">
            <div class="i-lucide:mic text-xs" />
            <span>{{ voiceModel }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card actions -->
    <div class="flex items-center justify-end px-2 py-1.5">
      <button
        class="rounded-lg p-1.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
        :disabled="isActive"
        @click.stop="emit('activate')"
      >
        <div
          :class="[
            isActive
              ? 'i-solar:check-circle-bold-duotone text-primary-500 dark:text-primary-400'
              : 'i-solar:play-circle-broken text-neutral-500 dark:text-neutral-400',
          ]"
        />
      </button>

      <button
        class="rounded-lg p-1.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700/50"
        @click.stop="emit('delete')"
      >
        <div class="i-solar:trash-bin-trash-linear text-neutral-500 dark:text-neutral-400" />
      </button>
    </div>
  </CursorFloating>
</template>
