<script setup lang="ts">
import { useActiveChatName } from '@proj-airi/stage-ui/composables/use-active-chat-name'
import { useCharacterPreviews } from '@proj-airi/stage-ui/composables/use-character-previews'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Avatar, dockItemClasses } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The button of the floating chat that names the character on the stage and the open chat. The host decides what a
 * click does, for example open the list of the chats.
 *
 * A plain button: `GhostButton` wraps its slot in a span that cannot shrink, so a long name could not truncate.
 */
const props = withDefaults(defineProps<{
  /**
   * - `names`: the avatar, then the character and the chat on two lines, for the island above the chat.
   * - `title`: the avatar and the chat on one line, for a dock that lies along the top.
   * - `avatar`: the avatar only, for a dock that stands up. The title of the button gives both names.
   */
  layout: 'names' | 'title' | 'avatar'
  /** Puts the avatar at the end, for a dock that a character on the left mirrors. @default false */
  mirrored?: boolean
}>(), { mirrored: false })

const { t } = useI18n()
const { activeCardId, cards } = storeToRefs(useAiriCardStore())
const characterPreviews = useCharacterPreviews()
const characterName = computed(() => cards.value.get(activeCardId.value)?.name ?? t('stage.character-switcher.empty'))
/** The name of the open chat, as its row shows it. A chat without a name shows the fallback in a lighter color. */
const chatName = useActiveChatName()
const chatTitle = computed(() => chatName.value ?? t('stage.chat.sessions.new-chat-fallback'))
const label = computed(() => `${characterName.value} · ${chatTitle.value} · ${t('tamagotchi.stage.chat-window.conversations')}`)
const chatNameClasses = computed(() => chatName.value ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-400 dark:text-neutral-500')

const shapeClasses = computed(() => {
  if (props.layout === 'names')
    return 'h-9 gap-2 py-0.5 pl-0.5 pr-3.5 text-left'
  if (props.layout === 'avatar')
    return 'p-0.5'
  return props.mirrored ? 'flex-row-reverse gap-1.5 py-0.5 pl-2 pr-0.5' : 'gap-1.5 py-0.5 pl-0.5 pr-2'
})
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :class="[
      'min-w-0 flex items-center rounded-full outline-none transition-colors',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
      dockItemClasses('blurry'),
      shapeClasses,
    ]"
  >
    <!-- Display model previews are portrait. Align them to the top so the circle keeps the head. -->
    <Avatar
      :src="characterPreviews.get(activeCardId)"
      :class="[
        'block shrink-0 rounded-full bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300',
        '[&_[data-avatar-image]]:object-top',
        props.layout === 'names' ? 'size-8' : 'size-6',
      ]"
    >
      <template #fallback>
        <span :class="[props.layout === 'names' ? 'text-sm' : 'text-xs', 'font-semibold']">{{ characterName.slice(0, 1) }}</span>
      </template>
    </Avatar>
    <span v-if="props.layout === 'names'" :class="['min-w-0 flex flex-col leading-tight']">
      <span :class="['truncate text-sm font-semibold']">{{ characterName }}</span>
      <span :class="['truncate text-xs', chatNameClasses]">{{ chatTitle }}</span>
    </span>
    <span
      v-else-if="props.layout === 'title'"
      :class="['truncate text-sm font-medium', chatName ? '' : 'text-neutral-400 dark:text-neutral-500']"
    >
      {{ chatTitle }}
    </span>
  </button>
</template>
