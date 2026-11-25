<script setup lang="ts">
import type { AiriCard } from '../../types/airiCard'

import { shallowRef } from 'vue'

import sceneUrl from '../../assets/backgrounds/cute-streaming-room-with-pastel-decor.avif'
import CharacterRail from './character-rail.vue'

import { useAiriCardStore } from '../../stores/modules/airi-card'

function card(name: string): AiriCard {
  return {
    name,
    version: '1.0.0',
    extensions: {
      airi: {
        avatarModels: [],
        agents: {},
        modules: {
          consciousness: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
          vision: { provider: '', model: '' },
        },
      },
    },
  }
}

// The fixture characters have no display model, so each avatar shows the first letter of the name.
const cardStore = useAiriCardStore()
cardStore.cards = new Map([
  ['relu', card('ReLU')],
  ['aria', card('Aria')],
  ['long', card('A character with a very long name')],
])
cardStore.activeCardId = 'relu'

const lastEvent = shallowRef('None')
// The docked rail beside a chat list picks the chats to show. The pick stays apart from the character on the stage.
const picked = shallowRef('aria')

/** The rail over the stage makes the pick the active character. The story has no model runtime, so only the mark moves. */
function activate(characterId: string) {
  lastEvent.value = `select: ${characterId}`
  cardStore.activeCardId = characterId
}
</script>

<template>
  <Story title="Character rail" group="misc">
    <Variant id="floating" title="Floating, opens on hover">
      <div :class="['flex flex-col gap-3 p-4']">
        <div
          :class="['relative h-96 rounded-2xl bg-cover bg-center']"
          :style="{ backgroundImage: `url(${sceneUrl})` }"
        >
          <CharacterRail :class="['absolute left-3 top-1/2 -translate-y-1/2']" @select="activate" @manage="lastEvent = 'manage'" />
        </div>
        <p :class="['text-sm text-neutral-500']">
          Last event: {{ lastEvent }}
        </p>
      </div>
    </Variant>
    <Variant id="docked" title="Docked beside a chat list">
      <div :class="['flex flex-col gap-3 p-4']">
        <div :class="['h-96 w-16 rounded-2xl bg-neutral-100 dark:bg-neutral-900']">
          <CharacterRail variant="docked" :selected="picked" :class="['bg-neutral-500/8 dark:bg-black/25']" @select="picked = $event" @manage="lastEvent = 'manage'" />
        </div>
        <p :class="['text-sm text-neutral-500']">
          The list shows: {{ picked }}. On the stage: {{ cardStore.activeCardId }}.
        </p>
      </div>
    </Variant>
    <Variant id="island" title="Island beside the floating chat">
      <div :class="['flex flex-col gap-3 p-4']">
        <div
          :class="['h-96 flex rounded-2xl bg-cover bg-center p-2']"
          :style="{ backgroundImage: `url(${sceneUrl})` }"
        >
          <CharacterRail variant="island" @select="activate" @manage="lastEvent = 'manage'" />
        </div>
        <p :class="['text-sm text-neutral-500']">
          Last event: {{ lastEvent }}
        </p>
      </div>
    </Variant>
  </Story>
</template>
