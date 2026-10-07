<script setup lang="ts">
import type { CardSyncState } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { CursorFloating } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'

interface Props {
  id: string
  name: string
  description?: string
  isActive: boolean
  isSelected: boolean
  version: string
  consciousnessModel: string
  voiceModel: string
  /** Absent when the user is not signed in, because nothing is uploaded then. */
  syncState?: CardSyncState
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'select'): void
  (e: 'activate'): void
  (e: 'delete'): void
  (e: 'edit'): void
}>()

const syncIcons = {
  synced: 'i-solar:cloud-check-outline',
  pending: 'i-solar:cloud-upload-outline',
  refused: 'i-solar:cloud-cross-outline',
} as const

const syncIcon = computed(() => props.syncState ? syncIcons[props.syncState] : undefined)

// Every icon button keeps one size, so the actions row cannot shift the card.
const iconButtonClasses = [
  'flex size-8 items-center justify-center rounded-lg',
  'text-neutral-500 dark:text-neutral-400',
  'transition-colors',
  'hover:bg-neutral-200 dark:hover:bg-neutral-700/50',
  'focus-visible:outline-2 focus-visible:outline-primary-500 dark:focus-visible:outline-primary-400',
]
</script>

<template>
  <CursorFloating
    :class="[
      'relative min-h-120px flex flex-col cursor-pointer overflow-hidden rounded-xl',
      isSelected
        ? 'border-2 border-primary-400 dark:border-primary-600'
        : 'border-2 border-neutral-100 dark:border-neutral-800/25',
      'bg-neutral-200/50 dark:bg-neutral-800/50',
      'drop-shadow-none hover:drop-shadow-[0px_4px_4px_rgba(220,220,220,0.4)] active:drop-shadow-[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:drop-shadow-none',
      'transition-all ease-in-out duration-400',
      'before:content-empty before:absolute before:inset-0 before:z-0 before:w-25% before:h-full',
      'before:transition-all before:duration-400 before:ease-in-out',
      'before:bg-gradient-to-r before:from-primary-500/0 before:to-primary-500/0',
      'dark:before:from-primary-400/0 dark:before:to-primary-400/0',
      'before:mask-image-[linear-gradient(120deg,white_100%)] before:opacity-0',
      'hover:before:opacity-100 hover:before:bg-gradient-to-r',
      'hover:before:from-primary-500/20 hover:before:via-primary-500/10 hover:before:to-transparent',
      'dark:hover:before:from-primary-400/20 dark:hover:before:via-primary-400/10 dark:hover:before:to-transparent',
    ]"
    @click="emit('select')"
  >
    <!-- Card content -->
    <div
      :class="[
        'relative flex flex-1 flex-col justify-between gap-3 overflow-hidden rounded-lg p-5',
        'bg-white dark:bg-neutral-900',
        'transition-all ease-in-out duration-400',
        'after:content-empty after:absolute after:inset-0 after:z--2 after:w-full after:h-full',
        'after:bg-dotted-[neutral-200/80] after:bg-size-10px',
        'after:mask-image-[linear-gradient(165deg,white_30%,transparent_50%)]',
        'after:transition-all after:duration-400 after:ease-in-out',
        'hover:after:bg-dotted-[primary-300/50] dark:hover:after:bg-dotted-[primary-200/20]',
        'hover:text-primary-600/80 dark:hover:text-primary-300/80',
      ]"
    >
      <!-- Card header (name and badge) -->
      <div :class="['z-1 flex items-start justify-between gap-2']">
        <h3 :class="['flex-1 truncate text-lg font-normal']" :title="name">
          {{ name }}
        </h3>
        <div :class="['flex shrink-0 items-center gap-1.5']">
          <div
            v-if="syncState && syncIcon"
            :class="[
              syncIcon,
              'text-sm',
              syncState === 'refused' ? 'text-amber-500' : 'text-neutral-500 dark:text-neutral-400',
            ]"
            :title="$t(`settings.pages.card.sync.state.${syncState}`)"
            :aria-label="$t(`settings.pages.card.sync.state.${syncState}`)"
            :data-sync-state="syncState"
          />
          <button
            type="button"
            :class="[...iconButtonClasses, 'size-7']"
            :aria-label="$t('settings.pages.card.edit_card')"
            :title="$t('settings.pages.card.edit_card')"
            @click.stop="emit('edit')"
          >
            <div i-solar:pen-2-bold-duotone :class="['text-sm']" />
          </button>
          <div
            v-if="isActive"
            :class="[
              'rounded-md p-1',
              'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400',
            ]"
            :title="$t('settings.pages.card.active')"
          >
            <div i-solar:check-circle-bold-duotone :class="['text-sm']" />
          </div>
        </div>
      </div>

      <!-- Card description -->
      <p v-if="description" :class="['line-clamp-3 min-h-40px flex-1 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ description }}
      </p>

      <!-- Card stats -->
      <div :class="['z-1 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400']">
        <div>v{{ version }}</div>
        <div :class="['flex items-center gap-1.5']">
          <div :class="['flex items-center gap-0.5']">
            <div i-lucide:ghost :class="['text-xs']" />
            <span>{{ consciousnessModel }}</span>
          </div>
          <div :class="['flex items-center gap-0.5']">
            <div i-lucide:mic :class="['text-xs']" />
            <span>{{ voiceModel }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Card actions -->
    <div :class="['flex items-center justify-end gap-1 px-2 py-1.5']">
      <button
        type="button"
        :class="iconButtonClasses"
        :disabled="isActive"
        :aria-label="$t(isActive ? 'settings.pages.card.active' : 'settings.pages.card.activate')"
        :title="$t(isActive ? 'settings.pages.card.active' : 'settings.pages.card.activate')"
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
        type="button"
        :class="iconButtonClasses"
        :aria-label="$t('settings.pages.card.delete')"
        :title="$t('settings.pages.card.delete')"
        @click.stop="emit('delete')"
      >
        <div i-solar:trash-bin-trash-linear :class="['text-neutral-500 dark:text-neutral-400']" />
      </button>
    </div>
  </CursorFloating>
</template>
