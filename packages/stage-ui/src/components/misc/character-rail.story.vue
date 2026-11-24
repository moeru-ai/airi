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
// The story has no model runtime. Activation only moves the active mark.
cardStore.activateCard = async (id: string) => {
  cardStore.activeCardId = id
  return true
}

const lastEvent = shallowRef('None')
</script>

<template>
  <Story title="Character rail" group="misc">
    <Variant id="floating" title="Floating, opens on hover">
      <div :class="['flex flex-col gap-3 p-4']">
        <div
          :class="['relative h-96 rounded-2xl bg-cover bg-center']"
          :style="{ backgroundImage: `url(${sceneUrl})` }"
        >
          <CharacterRail :class="['absolute left-3 top-1/2 -translate-y-1/2']" @manage="lastEvent = 'manage'" />
        </div>
        <p :class="['text-sm text-neutral-500']">
          Last event: {{ lastEvent }}
        </p>
      </div>
    </Variant>
  </Story>
</template>
