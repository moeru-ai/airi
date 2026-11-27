<script setup lang="ts">
import type { ChatSessionsPlace } from '../../../../types/chat-session'

import { DropdownMenu, MenuItem, MenuSeparator } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The title of the conversation list. It names the place that the list shows and switches it: all conversations or the
 * archive.
 */
const props = defineProps<{
  /** The place that the list shows. */
  place: ChatSessionsPlace
  /** The number of conversations that are not archived. */
  liveCount: number
  archivedCount: number
  compact: boolean
  /**
   * The character of the conversations. A column beside the chat names it in the title, as Discord names the server
   * above its channels. The archive then shows as a second line of the title.
   */
  character?: { name: string }
}>()

const emit = defineEmits<{
  selectPlace: [place: ChatSessionsPlace]
  /** Opens the settings of the character, like the server settings in the server menu of Discord. */
  openCharacter: []
}>()

const { t } = useI18n()
const placeMenuOpen = shallowRef(false)

const placeLabel = computed(() => props.place.kind === 'archive' ? t('stage.chat.sessions.archived') : t('stage.chat.sessions.all-conversations'))
const placeIcon = computed(() => props.place.kind === 'archive' ? 'i-mingcute:archive-line' : undefined)

const menuCountClasses = ['ml-auto pl-3 text-xs tabular-nums text-neutral-400 dark:text-neutral-500']
const menuCheckClasses = ['i-mingcute:check-line size-4 shrink-0 text-primary-500']
</script>

<template>
  <div :class="['flex shrink-0 items-center gap-0.5', props.compact ? 'mb-0.5 min-h-8' : 'mb-2 min-h-11']">
    <DropdownMenu v-model:open="placeMenuOpen" align="start" :side-offset="4" :content-class="['min-w-56 max-w-72 max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto']">
      <template #trigger>
        <button
          type="button"
          :title="t('stage.chat.sessions.switch-place')"
          :class="[
            'min-w-0 inline-flex items-center outline-none',
            'transition-colors duration-200 motion-reduce:transition-none',
            'hover:text-primary-600 dark:hover:text-primary-300',
            'focus-visible:outline-2 focus-visible:outline-primary-500',
            placeMenuOpen ? 'text-primary-600 dark:text-primary-300' : '',
            props.compact
              ? 'min-h-8 gap-1.5 rounded-lg px-1.5 py-0.5 text-sm font-semibold'
              : '-ml-1 h-11 gap-1.5 rounded-xl px-1 text-xl font-semibold tracking-tight',
          ]"
        >
          <template v-if="props.character">
            <span :class="['min-w-0 flex flex-col items-start leading-tight']">
              <span :class="['max-w-full truncate']">{{ props.character.name }}</span>
              <span v-if="props.place.kind === 'archive'" :class="['text-xs font-normal text-neutral-500 dark:text-neutral-400']">{{ placeLabel }}</span>
            </span>
          </template>
          <template v-else>
            <span v-if="placeIcon" aria-hidden="true" :class="[placeIcon, props.compact ? 'size-4' : 'size-5.5', 'shrink-0']" />
            <span :class="['truncate']">{{ placeLabel }}</span>
          </template>
          <span
            aria-hidden="true"
            :class="[
              'i-mingcute:down-line shrink-0 transition-transform duration-200 motion-reduce:transition-none',
              props.compact ? 'size-3.5' : 'size-4.5',
              placeMenuOpen ? 'rotate-180' : 'text-neutral-400 dark:text-neutral-500',
            ]"
          />
        </button>
      </template>
      <MenuItem @select="emit('selectPlace', { kind: 'all' })">
        <span aria-hidden="true" :class="['i-mingcute:chat-2-line size-4 shrink-0']" />
        <span :class="['min-w-0 truncate']">{{ t('stage.chat.sessions.all-conversations') }}</span>
        <span :class="menuCountClasses">{{ props.liveCount }}</span>
        <span v-if="props.place.kind === 'all'" aria-hidden="true" :class="menuCheckClasses" />
      </MenuItem>
      <MenuItem @select="emit('selectPlace', { kind: 'archive' })">
        <span aria-hidden="true" :class="['i-mingcute:archive-line size-4 shrink-0']" />
        <span :class="['min-w-0 truncate']">{{ t('stage.chat.sessions.archived') }}</span>
        <span :class="menuCountClasses">{{ props.archivedCount }}</span>
        <span v-if="props.place.kind === 'archive'" aria-hidden="true" :class="menuCheckClasses" />
      </MenuItem>
      <template v-if="props.character">
        <MenuSeparator />
        <MenuItem @select="emit('openCharacter')">
          <span aria-hidden="true" :class="['i-mingcute:settings-3-line size-4 shrink-0']" />
          <span :class="['min-w-0 truncate']">{{ t('stage.chat.sessions.character-settings') }}</span>
        </MenuItem>
      </template>
    </DropdownMenu>
    <!-- Actions of the whole list, for example its search, stand at the end of the title. -->
    <div v-if="$slots.default" :class="['ml-auto flex shrink-0 items-center']">
      <slot />
    </div>
  </div>
</template>
