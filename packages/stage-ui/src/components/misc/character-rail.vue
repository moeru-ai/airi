<script setup lang="ts">
import { Avatar, BasicButton, Tooltip } from '@proj-airi/ui'
import { useElementHover } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBackdropSurface } from '../../composables/backdrop-surface'
import { useCharacterPreviews } from '../../composables/use-character-previews'
import { useAiriCardStore } from '../../stores/modules/airi-card'

const props = withDefaults(defineProps<{
  /**
   * The form of the rail.
   * - `floating` floats over the stage as a pill and opens on hover to show names.
   * - `docked` is a column at the edge of a window: avatars only, no surface of its own, and it does not open.
   * - `island` is an island beside the floating chat: a rounded rectangle with avatars only. Its height comes from the
   *   host.
   * @default 'floating'
   */
  variant?: 'floating' | 'docked' | 'island'
  /**
   * The character that the rail marks as picked. A rail beside a conversation list passes the character whose
   * conversations the list shows, which can differ from the character on the stage. Without it, the rail marks the
   * character on the stage.
   */
  selected?: string
  /** The side of the tooltips of a docked rail or an island. Pick the side that faces into the window. @default 'right' */
  tooltipSide?: 'left' | 'right'
}>(), { variant: 'floating', tooltipSide: 'right' })

const emit = defineEmits<{
  /**
   * The user picked a character. The host decides what the pick does: a rail over the stage makes it the active
   * character, and a rail beside a conversation list shows its conversations.
   */
  select: [characterId: string]
  /** The user asked for the character management page. The host opens it, because each app opens settings its own way. */
  manage: []
}>()

const { t } = useI18n()
const { cards, activeCardId } = storeToRefs(useAiriCardStore())
const previews = useCharacterPreviews()

/** The picked character. A ring marks the character on the stage, and the fill of its row marks the picked one. */
const selectedId = computed(() => props.selected ?? activeCardId.value)

// The rail keeps the order of the cards, so each character keeps its place while the user chats.
const entries = computed(() => Array.from(cards.value, ([id, card]) => ({
  id,
  name: card.name,
  preview: previews.value.get(id),
  onStage: id === activeCardId.value,
})))

const floating = computed(() => props.variant === 'floating')
const island = computed(() => props.variant === 'island')

const rail = useTemplateRef<HTMLElement>('rail')
// The floating rail and the island are glass. Over the stage the CSS blur draws it. Over the desktop, for example beside
// the floating chat window, the host draws native window glass behind it.
useBackdropSurface(rail, { enabled: () => props.variant !== 'docked' })
// The delays keep the rail closed when the pointer only passes over it, and open when the pointer leaves for a moment.
const hovered = useElementHover(rail, { delayEnter: 80, delayLeave: 200 })
const keyboardFocused = shallowRef(false)
/** The rail shows avatars only. A floating rail opens to show names while the pointer is over it or the keyboard focus is in it. */
const open = computed(() => floating.value && (hovered.value || keyboardFocused.value))

function trackFocus(event: FocusEvent) {
  // A click also focuses a button. Only keyboard focus opens the rail, so it closes when the pointer leaves after a click.
  keyboardFocused.value = event.target instanceof HTMLElement && event.target.matches(':focus-visible')
}

function trackBlur(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !rail.value?.contains(event.relatedTarget))
    keyboardFocused.value = false
}

/** The name of a character for its tooltip and its accessible name. The character on the stage says so in words. */
function labelOf(entry: { name: string, onStage: boolean }) {
  return entry.onStage ? t('stage.character-switcher.on-stage', { name: entry.name }) : entry.name
}

// The row is the highlight, with the avatar inside it at an even 4px inset. The avatar stays at the same place when the
// rail opens, so only the names fade in. The row is a pill: its round ends share their center with the corners of the
// floating rail, as the buttons of a `Dock` share it with the dock.
const rowClasses = [
  'h-10 w-full shrink-0 rounded-full p-1 outline-none justify-start! gap-2.5',
  '[&_.basic-button-content]:w-full [&_.basic-button-content]:min-w-0 [&_.basic-button-content]:justify-start',
  'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-1',
]
// An avatar is a solid picture, heavier than an icon, so the island draws no fill around it. Its states are rings
// around the avatar. The square of the row is 12px round, the island radius 20px less its 8px padding.
const islandRowClasses = [
  'group size-10 shrink-0 rounded-xl p-1 outline-none',
  'focus-visible:outline-2 focus-visible:outline-primary-500',
]
const labelClasses = computed(() => [
  'min-w-0 flex-1 truncate pr-2 text-left text-[13px] leading-5',
  'transition-opacity duration-200 ease-in-out motion-reduce:transition-none',
  open.value ? 'opacity-100 delay-100' : 'opacity-0',
])

/** The ring of an avatar: the theme color for the character on the stage, and a neutral ring under the pointer. */
function avatarRingClasses(onStage: boolean) {
  if (island.value) {
    return [
      'ring-offset-1 ring-offset-neutral-50 transition-shadow duration-150 motion-reduce:transition-none dark:ring-offset-neutral-800',
      onStage ? 'ring-2 ring-primary-500' : 'group-hover:ring-2 group-hover:ring-neutral-400/40 dark:group-hover:ring-neutral-500/50',
    ]
  }
  return onStage && !open.value ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : ''
}
</script>

<template>
  <nav
    ref="rail"
    data-testid="character-rail"
    :data-open="open"
    :aria-label="t('stage.character-switcher.title')"
    :class="variant === 'docked'
      ? ['h-full w-16 flex shrink-0 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-3 py-3 [scrollbar-width:none]']
      : island
        ? [
          // The surface of a blurry `Dock`. The island is a rounded rectangle, because the avatars need room around them. It
          // meets the edge of the floating chat window, which would cut a shadow, so it has none.
          'w-14 flex shrink-0 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto rounded-[20px] p-2 [scrollbar-width:none]',
          'bg-neutral-50/80 backdrop-blur-[12px] dark:bg-neutral-800/70',
        ]
        : [
          // The corner radius is half the closed width, so the closed rail is a pill like a `Dock`. The open rail keeps the
          // same corners. With the 8px padding, they are concentric with the 40px rows.
          'max-h-[70dvh] flex flex-col gap-1 overflow-x-hidden overflow-y-auto rounded-[28px] p-2 [scrollbar-width:none]',
          'border border-white/40 backdrop-blur-xl backdrop-saturate-150 dark:border-white/10',
          'transition-[width,background-color,box-shadow] duration-300 ease-in-out motion-reduce:transition-none',
          open ? 'w-48 bg-white/70 shadow-lg dark:bg-neutral-900/70' : 'w-14 bg-white/45 shadow-sm dark:bg-neutral-900/45',
        ]"
    @focusin="trackFocus"
    @focusout="trackBlur"
  >
    <Tooltip
      v-for="entry in entries"
      :key="entry.id"
      :label="labelOf(entry)"
      :side="props.tooltipSide"
      :disabled="floating"
    >
      <!--
        The fill of the row marks the picked character, in the open rail and in the docked rail. A ring marks the
        character on the stage, except in the open rail, where its name is bold. The island picks the character on the
        stage, so its ring is its only mark.
      -->
      <BasicButton
        size="unset"
        data-testid="character-rail-item"
        :aria-label="labelOf(entry)"
        :aria-pressed="entry.id === selectedId"
        :title="floating && !open ? labelOf(entry) : undefined"
        :class="island
          ? islandRowClasses
          : [
            rowClasses,
            open || variant === 'docked' ? 'hover:bg-neutral-500/10' : '',
            (open || variant === 'docked') && entry.id === selectedId ? 'bg-neutral-500/15' : '',
          ]"
        @click="emit('select', entry.id)"
      >
        <!-- Display model previews are portrait. Align them to the top so the circle keeps the head. -->
        <Avatar
          :src="entry.preview"
          :class="[
            // The avatar root is an inline element. It takes a size only as a block.
            'block size-8 shrink-0 rounded-full bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300',
            '[&_[data-avatar-image]]:object-top',
            avatarRingClasses(entry.onStage),
          ]"
        >
          <template #fallback>
            <span :class="['text-sm font-semibold']">{{ entry.name.slice(0, 1) }}</span>
          </template>
        </Avatar>
        <span
          v-if="floating"
          aria-hidden="true"
          :class="[
            labelClasses,
            entry.onStage ? 'font-semibold text-neutral-900 dark:text-neutral-50' : 'font-medium text-neutral-600 dark:text-neutral-300',
          ]"
        >
          {{ entry.name }}
        </span>
      </BasicButton>
    </Tooltip>
    <!-- The line has no fixed width, so it spans the closed rail and the open rail. The island keeps Manage at its end. -->
    <span v-if="!island" aria-hidden="true" :class="['mx-2 my-1 h-px shrink-0 bg-neutral-400/30']" />
    <Tooltip :label="t('stage.character-switcher.manage')" :side="props.tooltipSide" :disabled="!island">
      <BasicButton
        size="unset"
        data-testid="character-rail-manage"
        :aria-label="t('stage.character-switcher.manage')"
        :title="open || island ? undefined : t('stage.character-switcher.manage')"
        :class="island
          ? [islandRowClasses, 'mt-auto text-neutral-600 hover:bg-neutral-500/10 dark:text-neutral-300']
          : [rowClasses, 'text-neutral-600 dark:text-neutral-300', 'hover:bg-neutral-500/10']"
        @click="emit('manage')"
      >
        <span :class="['size-8 flex shrink-0 items-center justify-center']">
          <span aria-hidden="true" :class="['i-mingcute:group-line', island ? 'size-5' : 'size-4.5']" />
        </span>
        <span v-if="floating" aria-hidden="true" :class="[labelClasses, 'font-medium']">
          {{ t('stage.character-switcher.manage') }}
        </span>
      </BasicButton>
    </Tooltip>
  </nav>
</template>
