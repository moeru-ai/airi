<script setup lang="ts">
import type { CardSyncState } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { CursorFloating } from '@proj-airi/stage-ui/components'
import { Avatar, IconButton } from '@proj-airi/ui'
import { computed } from 'vue'

interface Props {
  id: string
  name: string
  description?: string
  /** Preview of the card's display model; absent models render the fallback icon. */
  previewImage?: string
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
  'size-8 rounded-lg',
  'text-neutral-500 dark:text-neutral-400',
  'hover:bg-neutral-200 dark:hover:bg-neutral-700/50',
  'focus-visible:outline-2 focus-visible:outline-primary-500 dark:focus-visible:outline-primary-400',
]
</script>

<template>
  <CursorFloating
    :class="[
      'relative flex flex-col cursor-pointer overflow-hidden rounded-xl',
      isSelected
        ? 'border-2 border-primary-400 dark:border-primary-600'
        : 'border-2 border-neutral-100 dark:border-neutral-800/25',
      'bg-white dark:bg-neutral-900',
      'drop-shadow-none hover:drop-shadow-[0px_4px_4px_rgba(220,220,220,0.4)] active:drop-shadow-[0px_0px_0px_rgba(220,220,220,0.25)] dark:hover:drop-shadow-none',
      'transition-all ease-in-out duration-400',
    ]"
    @click="emit('select')"
  >
    <!-- Preview with overlaid state badges -->
    <div :class="['relative']">
      <Avatar
        :src="previewImage"
        :alt="name"
        :class="[
          'aspect-[4/3] w-full rounded-xl',
          'bg-neutral-100 text-neutral-400 dark:bg-neutral-800',
        ]"
      >
        <template #fallback>
          <span aria-hidden="true" :class="['i-solar:user-rounded-outline size-10']" />
        </template>
      </Avatar>
      <div
        v-if="syncState && syncIcon"
        :class="[
          'absolute left-2 top-2 rounded-full p-1 text-sm backdrop-blur-sm',
          'bg-white/80 dark:bg-black/50',
          syncState === 'refused' ? 'text-amber-500' : 'text-neutral-500 dark:text-neutral-400',
        ]"
        :title="$t(`settings.pages.card.sync.state.${syncState}`)"
        :aria-label="$t(`settings.pages.card.sync.state.${syncState}`)"
        :data-sync-state="syncState"
      >
        <div :class="syncIcon" />
      </div>
      <div
        v-if="isActive"
        :class="[
          'absolute right-2 top-2 rounded-full p-1 text-sm',
          'bg-primary-500 text-white dark:bg-primary-400 dark:text-neutral-900',
        ]"
        :title="$t('settings.pages.card.active')"
      >
        <div i-solar:check-circle-bold-duotone />
      </div>
    </div>

    <!-- Body -->
    <div :class="['flex flex-1 flex-col gap-2 p-4']">
      <h3 :class="['truncate text-lg font-normal']" :title="name">
        {{ name }}
      </h3>
      <p v-if="description" :class="['line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ description }}
      </p>

      <!-- Version and module chips -->
      <div :class="['mt-auto flex items-center justify-between pt-1 text-xs text-neutral-500 dark:text-neutral-400']">
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

      <!-- Actions -->
      <div :class="['flex items-center justify-end gap-1 border-t border-neutral-100 pt-2 dark:border-neutral-800']">
        <IconButton
          icon="i-solar:pen-2-bold-duotone"
          :class="iconButtonClasses"
          :aria-label="$t('settings.pages.card.edit_card')"
          :title="$t('settings.pages.card.edit_card')"
          @click.stop="emit('edit')"
        />
        <IconButton
          :icon="isActive ? 'i-solar:check-circle-bold-duotone' : 'i-solar:play-circle-broken'"
          :class="[
            ...iconButtonClasses,
            isActive ? 'text-primary-500 dark:text-primary-400' : '',
          ]"
          :disabled="isActive"
          :aria-label="$t(isActive ? 'settings.pages.card.active' : 'settings.pages.card.activate')"
          :title="$t(isActive ? 'settings.pages.card.active' : 'settings.pages.card.activate')"
          @click.stop="emit('activate')"
        />
        <IconButton
          v-if="id !== 'default'"
          icon="i-solar:trash-bin-trash-linear"
          :class="iconButtonClasses"
          :aria-label="$t('settings.pages.card.delete')"
          :title="$t('settings.pages.card.delete')"
          @click.stop="emit('delete')"
        />
      </div>
    </div>
  </CursorFloating>
</template>
