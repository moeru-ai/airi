<script setup lang="ts">
import { CursorFloating } from '@proj-airi/stage-ui/components'

interface Props {
  id: string
  name: string
  description?: string
  isActive: boolean
  isSelected: boolean
  version: string
  consciousnessModel: string
  voiceModel: string
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'select'): void
  (e: 'activate'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <CursorFloating
    relative min-h-120px flex="~ col" cursor-pointer overflow-hidden rounded-xl
    :class="[
      isSelected
        ? 'border-2 border-primary-400 dark:border-primary-600'
        : 'border-2 border-neutral-100 dark:border-neutral-800/25',
    ]"
    bg="neutral-200/50 dark:neutral-800/50"
    drop-shadow="none hover:[0px_4px_4px_rgba(220,220,220,0.4)] active:[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:none"
    transition="all ease-in-out duration-400"
    before="content-empty absolute inset-0 z-0 w-25% h-full transition-all duration-400 ease-in-out bg-gradient-to-r from-primary-500/0 to-primary-500/0 dark:from-primary-400/0 dark:to-primary-400/0 mask-image-[linear-gradient(120deg,white_100%)] opacity-0"
    hover="before:(opacity-100 bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10 dark:to-transparent)"
    @click="emit('select')"
  >
    <!-- Card content -->
    <div
      relative flex="~ col 1" justify-between gap-3 overflow-hidden rounded-lg bg="white dark:neutral-900" p-5
      transition="all ease-in-out duration-400"
      after="content-empty absolute inset-0 z--2 w-full h-full bg-dotted-[neutral-200/80] bg-size-10px mask-image-[linear-gradient(165deg,white_30%,transparent_50%)] transition-all duration-400 ease-in-out"
      hover="after:bg-dotted-[primary-300/50] dark:after:bg-dotted-[primary-200/20] text-primary-600/80 dark:text-primary-300/80"
    >
      <!-- Card header (name and badge) -->
      <div z-1 flex items-start justify-between gap-2>
        <h3 flex-1 truncate text-lg font-normal>
          {{ name }}
        </h3>
        <div v-if="isActive" shrink-0 rounded-md p-1 bg="primary-100 dark:primary-900/40" text="primary-600 dark:primary-400">
          <div i-solar:check-circle-bold-duotone text-sm />
        </div>
      </div>

      <!-- Card description -->
      <p v-if="description" line-clamp-3 min-h-40px flex-1 text-sm text="neutral-500 dark:neutral-400">
        {{ description }}
      </p>

      <!-- Card stats -->
      <div z-1 flex items-center justify-between text-xs text="neutral-500 dark:neutral-400">
        <div>v{{ version }}</div>
        <div flex items-center gap-1.5>
          <div flex items-center gap-0.5>
            <div i-lucide:ghost text-xs />
            <span>{{ consciousnessModel }}</span>
          </div>
          <div flex items-center gap-0.5>
            <div i-lucide:mic text-xs />
            <span>{{ voiceModel }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card actions -->
    <div flex items-center justify-end px-2 py-1.5>
      <button
        rounded-lg p-1.5 transition-colors hover="bg-neutral-200 dark:bg-neutral-700/50"
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
        v-if="id !== 'default'"
        rounded-lg p-1.5 transition-colors hover="bg-neutral-200 dark:bg-neutral-700/50"
        @click.stop="emit('delete')"
      >
        <div i-solar:trash-bin-trash-linear text="neutral-500 dark:neutral-400" />
      </button>
    </div>
  </CursorFloating>
</template>
