<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import CharacterRail from '../../../misc/character-rail.vue'
import SessionsDrawer from './sessions-drawer.vue'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'

const props = withDefaults(defineProps<{
  /** The host is a desktop window. See `ChatSessionsDrawer`. */
  desktop?: boolean
  /** The sidebar is on a touch screen, for example in the side drawer of the phone. */
  touch?: boolean
}>(), {
  desktop: false,
  touch: false,
})

const emit = defineEmits<{
  /** The user asked for the character management page. The host opens it, because each app opens settings its own way. */
  manage: []
  /** The user asked for the settings of the character of the list. */
  openCharacterSettings: [characterId: string]
}>()

/** The surface that holds the sidebar, for example a popover or a drawer. Opening a chat closes it. */
const open = defineModel<boolean>('open', { default: false })

const { activeCardId } = storeToRefs(useAiriCardStore())

/**
 * The character that the user picked on the rail. The pick changes only the list: the stage keeps its character until
 * the user opens or starts a chat of the picked character. The pick ends when the stage changes its character, so the
 * list follows the stage again. Opening a chat selects the chat at once and activates its character later. Ending the
 * pick at the selection would show the chats of the earlier character until the activation finishes.
 */
const picked = shallowRef<string>()
const shownCharacterId = computed(() => picked.value ?? (activeCardId.value || 'default'))
watch(activeCardId, () => {
  picked.value = undefined
})
</script>

<template>
  <!--
    The layout of a messenger: the characters, then the chats of the picked character. The rail is one step darker than
    the surface that holds the sidebar, so the two columns need no line between them. The chats take 240px, and they
    grow when the host gives the sidebar more room, for example the side drawer of the phone.
  -->
  <div :class="['h-full min-h-0 flex']">
    <CharacterRail
      variant="docked"
      :selected="shownCharacterId"
      :class="['bg-neutral-500/8 dark:bg-black/25']"
      @select="characterId => picked = characterId"
      @manage="emit('manage')"
    />
    <SessionsDrawer
      v-model="open"
      desktop-mode="inline"
      :desktop="props.desktop"
      :touch="props.touch"
      :character-id="shownCharacterId"
      :class="['w-60 min-w-0 grow']"
      @open-character-settings="characterId => emit('openCharacterSettings', characterId)"
    />
  </div>
</template>
