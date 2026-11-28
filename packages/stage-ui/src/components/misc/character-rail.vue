<script setup lang="ts">
import { Avatar, BasicButton, DropdownMenu, MenuItem, Tooltip } from '@proj-airi/ui'
import { useElementHover } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBackdropSurface } from '../../composables/backdrop-surface'
import { useCharacterPreviews } from '../../composables/use-character-previews'
import { useAuthStore } from '../../stores/auth'
import { useChatSessionStore } from '../../stores/chat/session-store'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useListReorderMotion } from '../scenarios/chat/composables/use-list-reorder-motion'

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
  /** The side of the tooltips of a docked rail or an island. Pick the side that faces into the window. @default 'right' */
  tooltipSide?: 'left' | 'right'
  /** A right click on an avatar opens a menu with Edit, and the rail emits `edit`. @default false */
  editable?: boolean
}>(), { variant: 'floating', tooltipSide: 'right', editable: false })

const emit = defineEmits<{
  /**
   * The user picked a character. The host activates it, because each host has its own steps around the switch, for
   * example the floating chat opens the last chat of the character.
   */
  select: [characterId: string]
  /** The user asked for the character management page. The host opens it, because each app opens settings its own way. */
  manage: []
  /** The user asked to edit a character from the menu of its avatar. The host opens the page of that character. */
  edit: [characterId: string]
}>()

const { t } = useI18n()
const { cards, activeCardId } = storeToRefs(useAiriCardStore())
const { sessionMetas } = storeToRefs(useChatSessionStore())
const { userId } = storeToRefs(useAuthStore())
const previews = useCharacterPreviews()

/** The time of the latest visible conversation of each character. */
const lastActivityByCharacter = computed(() => {
  const effectiveUserId = userId.value || 'local'
  const activity = new Map<string, number>()
  for (const meta of Object.values(sessionMetas.value)) {
    // A hidden conversation is a background task. It is not a chat with the character.
    if (meta.userId !== effectiveUserId || meta.hidden)
      continue
    activity.set(meta.characterId, Math.max(activity.get(meta.characterId) ?? 0, meta.updatedAt))
  }
  return activity
})

// Characters with a recent conversation come first. Characters without one keep the card order.
const entries = computed(() => Array.from(cards.value, ([id, card], order) => ({
  id,
  name: card.name,
  preview: previews.value.get(id),
  onStage: id === activeCardId.value,
  lastActivity: lastActivityByCharacter.value.get(id) ?? 0,
  order,
})).sort((first, second) => second.lastActivity - first.lastActivity || first.order - second.order))

const floating = computed(() => props.variant === 'floating')
const island = computed(() => props.variant === 'island')

const rail = useTemplateRef<HTMLElement>('rail')

/**
 * The menu of an avatar. One menu serves the whole rail. It opens beside the avatar, on the side of its tooltip, so it
 * never covers the avatar. Its trigger is hidden, because a menu trigger opens on a left click, and the left click picks
 * the character. The open menu takes the pointer, so the avatar keeps its hover look until the menu has left. Then the
 * avatar gets the focus back.
 */
const menuOpen = shallowRef(false)
const menuCharacterId = shallowRef<string>()
const menuAvatar = shallowRef<HTMLElement>()

function openMenu(event: MouseEvent, characterId: string) {
  if (!props.editable)
    return
  event.preventDefault()
  menuAvatar.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
  menuCharacterId.value = characterId
  menuOpen.value = true
}

function returnFocus(event: Event) {
  event.preventDefault()
  menuCharacterId.value = undefined
  menuAvatar.value?.focus({ preventScroll: true })
}
const items = useTemplateRef<HTMLElement>('items')
// A recent chat moves its character up. The avatars slide to their new places in every form of the rail.
useListReorderMotion({
  list: items,
  keys: () => entries.value.map(entry => entry.id),
  keyOf: item => item.dataset.characterKey,
})
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

/**
 * The marks of an avatar. A closed rail shows the avatars of the other characters fainter. The island rings the
 * character on the stage in the theme color, and the avatar under the pointer in a neutral color. The other rails ring
 * the character on the stage while they are closed. The open rail marks it by its row and its bold name instead.
 */
function avatarStateClasses(onStage: boolean, menuShown: boolean) {
  const faint = !onStage && !open.value ? 'opacity-70' : ''
  if (island.value) {
    return [
      'ring-offset-1 ring-offset-neutral-50 transition-[box-shadow,opacity] duration-150 motion-reduce:transition-none dark:ring-offset-neutral-800',
      onStage
        ? 'ring-2 ring-primary-500'
        : menuShown
          ? 'ring-2 ring-neutral-400/40 dark:ring-neutral-500/50'
          : 'group-hover:ring-2 group-hover:ring-neutral-400/40 dark:group-hover:ring-neutral-500/50',
      faint,
    ]
  }
  return [
    'transition-opacity duration-300 ease-in-out motion-reduce:transition-none',
    onStage && !open.value ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : '',
    faint,
  ]
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
          // meets the edge of the floating chat window, which would cut a shadow, so it has none. Its avatars scroll inside
          // it, and Manage stays at its end.
          'w-14 flex shrink-0 flex-col items-center gap-1 overflow-hidden rounded-[20px] py-1.5',
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
    <!--
      Only the island scrolls its avatars apart from Manage. It pads the scroll area, so the focus rings of the rows are
      not cut, and the rows stay 8px inside the island. The other rails keep the gaps of the rail. The rows move inside
      this box when the order changes, so it is the positioned parent of the rows.
    -->
    <div
      ref="items"
      :class="island
        ? ['relative min-h-0 w-full flex flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto px-2 py-0.5 [scrollbar-width:none]']
        : variant === 'docked'
          ? ['relative w-full flex shrink-0 flex-col items-center gap-2']
          : ['relative w-full flex shrink-0 flex-col gap-1']"
    >
      <Tooltip
        v-for="entry in entries"
        :key="entry.id"
        :label="labelOf(entry)"
        :side="props.tooltipSide"
        :disabled="floating"
      >
        <!--
          The fill of the row marks the character on the stage, in the open rail and in the docked rail. A ring marks it
          too, except in the open rail, where its name is bold. The island marks it with the ring only.
        -->
        <BasicButton
          size="unset"
          data-testid="character-rail-item"
          :data-character-key="entry.id"
          :aria-label="labelOf(entry)"
          :aria-pressed="entry.onStage"
          :title="floating && !open ? labelOf(entry) : undefined"
          :class="island
            ? islandRowClasses
            : [
              rowClasses,
              open || variant === 'docked' ? 'hover:bg-neutral-500/10' : '',
              (open || variant === 'docked') && entry.onStage ? 'bg-neutral-500/15' : '',
              variant === 'docked' && !entry.onStage && menuCharacterId === entry.id ? 'bg-neutral-500/10' : '',
            ]"
          @click="emit('select', entry.id)"
          @contextmenu="openMenu($event, entry.id)"
        >
          <!-- Display model previews are portrait. Align them to the top so the circle keeps the head. -->
          <Avatar
            :src="entry.preview"
            :class="[
              // The avatar root is an inline element. It takes a size only as a block.
              'block size-8 shrink-0 rounded-full bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300',
              '[&_[data-avatar-image]]:object-top',
              avatarStateClasses(entry.onStage, menuCharacterId === entry.id),
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
    </div>
    <DropdownMenu
      v-if="props.editable"
      v-model:open="menuOpen"
      :reference="menuAvatar"
      :side="props.tooltipSide"
      align="center"
      @close-auto-focus="returnFocus"
    >
      <template #trigger>
        <span aria-hidden="true" tabindex="-1" :class="['pointer-events-none absolute size-0']" />
      </template>
      <MenuItem @select="menuCharacterId && emit('edit', menuCharacterId)">
        <span aria-hidden="true" :class="['i-mingcute:edit-2-line size-4 shrink-0']" />
        {{ t('stage.character-switcher.edit') }}
      </MenuItem>
    </DropdownMenu>
    <!-- The line has no fixed width, so it spans the closed rail and the open rail. The island keeps Manage at its end. -->
    <span v-if="!island" aria-hidden="true" :class="['mx-2 my-1 h-px shrink-0 bg-neutral-400/30']" />
    <Tooltip :label="t('stage.character-switcher.manage')" :side="props.tooltipSide" :disabled="!island">
      <BasicButton
        size="unset"
        data-testid="character-rail-manage"
        :aria-label="t('stage.character-switcher.manage')"
        :title="open || island ? undefined : t('stage.character-switcher.manage')"
        :class="island
          ? [islandRowClasses, 'mb-0.5 text-neutral-600 hover:bg-neutral-500/10 dark:text-neutral-300']
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
