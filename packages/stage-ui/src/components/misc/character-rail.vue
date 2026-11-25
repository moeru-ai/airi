<script setup lang="ts">
import { Avatar, BasicButton, Tooltip } from '@proj-airi/ui'
import { useElementHover } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useBackdropSurface } from '../../composables/backdrop-surface'
import { useCharacterPreviews } from '../../composables/use-character-previews'
import { useAuthStore } from '../../stores/auth'
import { useChatSessionStore } from '../../stores/chat/session-store'
import { useAiriCardStore } from '../../stores/modules/airi-card'

const props = withDefaults(defineProps<{
  /**
   * Docks the rail as a column at the edge of a window: avatars only, no surface of its own, and it does not open on hover.
   * Without it, the rail floats over the stage and opens to show names.
   * @default false
   */
  docked?: boolean
}>(), { docked: false })

const emit = defineEmits<{
  /** The user asked for the character management page. The host opens it, because each app opens settings its own way. */
  manage: []
}>()

const { t } = useI18n()
const cardStore = useAiriCardStore()
const { cards, activeCardId } = storeToRefs(cardStore)
const { sessionMetas } = storeToRefs(useChatSessionStore())
const { userId } = storeToRefs(useAuthStore())
const previews = useCharacterPreviews()
const switching = shallowRef(false)

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
  lastActivity: lastActivityByCharacter.value.get(id) ?? 0,
  order,
})).sort((first, second) => second.lastActivity - first.lastActivity || first.order - second.order))

const rail = useTemplateRef<HTMLElement>('rail')
// The floating rail is glass. Over the stage the CSS blur draws it. Over the desktop, for example beside the floating chat
// window, the host draws native window glass behind it.
useBackdropSurface(rail, { enabled: () => !props.docked })
// The delays keep the rail closed when the pointer only passes over it, and open when the pointer leaves for a moment.
const hovered = useElementHover(rail, { delayEnter: 80, delayLeave: 200 })
const keyboardFocused = shallowRef(false)
/** The rail shows avatars only. It opens to show names while the pointer is over it or the keyboard focus is in it. */
const open = computed(() => !props.docked && (hovered.value || keyboardFocused.value))

function trackFocus(event: FocusEvent) {
  // A click also focuses a button. Only keyboard focus opens the rail, so it closes when the pointer leaves after a click.
  keyboardFocused.value = event.target instanceof HTMLElement && event.target.matches(':focus-visible')
}

function trackBlur(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !rail.value?.contains(event.relatedTarget))
    keyboardFocused.value = false
}

async function selectCharacter(id: string) {
  if (switching.value || id === activeCardId.value)
    return
  switching.value = true
  try {
    if (!await cardStore.activateCard(id))
      toast.error(t('stage.character-switcher.failed'))
  }
  catch {
    toast.error(t('stage.character-switcher.failed'))
  }
  finally {
    switching.value = false
  }
}

// The row is the highlight, with the avatar inside it at an even 4px inset. The avatar stays at the same place when the
// rail opens, so only the names fade in. The row is a pill: its round ends share their center with the corners of the
// floating rail, as the buttons of a `Dock` share it with the dock.
const rowClasses = [
  'h-10 w-full shrink-0 rounded-full p-1 outline-none justify-start! gap-2.5',
  '[&_.basic-button-content]:w-full [&_.basic-button-content]:min-w-0 [&_.basic-button-content]:justify-start',
  'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-1',
]
const labelClasses = computed(() => [
  'min-w-0 flex-1 truncate pr-2 text-left text-[13px] leading-5',
  'transition-opacity duration-200 ease-in-out motion-reduce:transition-none',
  open.value ? 'opacity-100 delay-100' : 'opacity-0',
])
</script>

<template>
  <nav
    ref="rail"
    data-testid="character-rail"
    :data-open="open"
    :aria-label="t('stage.character-switcher.title')"
    :class="docked
      ? ['h-full w-16 flex shrink-0 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-3 py-3 [scrollbar-width:none]']
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
      :label="entry.name"
      side="right"
      :disabled="!docked"
    >
      <BasicButton
        size="unset"
        data-testid="character-rail-item"
        :aria-label="entry.name"
        :aria-pressed="entry.id === activeCardId"
        :title="open || docked ? undefined : entry.name"
        :disabled="switching"
        :class="[
          rowClasses,
          open ? 'hover:bg-neutral-500/10' : '',
          open && entry.id === activeCardId ? 'bg-neutral-500/10' : '',
        ]"
        @click="selectCharacter(entry.id)"
      >
        <!-- Display model previews are portrait. Align them to the top so the circle keeps the head. -->
        <Avatar
          :src="entry.preview"
          :class="[
            // The avatar root is an inline element. It takes a size only as a block.
            'block size-8 shrink-0 rounded-full bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300',
            'transition-opacity duration-300 ease-in-out motion-reduce:transition-none',
            '[&_[data-avatar-image]]:object-top',
            // The open rail marks the current character by its row. The closed rail has only the avatar, so a ring marks it.
            entry.id === activeCardId && !open ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : '',
            entry.id !== activeCardId && !open ? 'opacity-70' : '',
          ]"
        >
          <template #fallback>
            <span :class="['text-sm font-semibold']">{{ entry.name.slice(0, 1) }}</span>
          </template>
        </Avatar>
        <span
          v-if="!docked"
          aria-hidden="true"
          :class="[
            labelClasses,
            entry.id === activeCardId ? 'font-semibold text-neutral-900 dark:text-neutral-50' : 'font-medium text-neutral-600 dark:text-neutral-300',
          ]"
        >
          {{ entry.name }}
        </span>
      </BasicButton>
    </Tooltip>
    <!-- The line has no fixed width, so it spans the closed rail and the open rail. -->
    <span aria-hidden="true" :class="['mx-2 my-1 h-px shrink-0 bg-neutral-400/30']" />
    <BasicButton
      size="unset"
      data-testid="character-rail-manage"
      :aria-label="t('stage.character-switcher.manage')"
      :title="open ? undefined : t('stage.character-switcher.manage')"
      :class="[
        rowClasses,
        'text-neutral-600 dark:text-neutral-300',
        'hover:bg-neutral-500/10',
      ]"
      @click="emit('manage')"
    >
      <span :class="['size-8 flex shrink-0 items-center justify-center']">
        <span aria-hidden="true" :class="['i-solar:users-group-rounded-outline size-4.5']" />
      </span>
      <span v-if="!docked" aria-hidden="true" :class="[labelClasses, 'font-medium']">
        {{ t('stage.character-switcher.manage') }}
      </span>
    </BasicButton>
  </nav>
</template>
