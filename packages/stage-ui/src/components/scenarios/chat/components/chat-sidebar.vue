<script setup lang="ts">
import CharacterRail from '../../../misc/character-rail.vue'
import SessionsDrawer from './sessions-drawer.vue'

import { useListCharacter } from '../../../../composables/use-list-character'

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

/** The rail picks the character of the list. The stage keeps its character. See `useListCharacter`. */
const { shownCharacterId, pick } = useListCharacter()
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
      @select="pick"
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
