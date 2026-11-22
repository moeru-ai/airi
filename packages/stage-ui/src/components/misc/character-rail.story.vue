<script setup lang="ts">
import type { AiriCard } from '../../types/airiCard'

import { shallowRef } from 'vue'

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
    <Variant id="avatars" title="Avatars only">
      <div :class="['h-96 flex bg-neutral-50 dark:bg-neutral-950']">
        <CharacterRail :class="['shrink-0 bg-neutral-100/60 dark:bg-neutral-900/60']" @switched="id => lastEvent = `switched ${id}`" @manage="lastEvent = 'manage'" />
        <div :class="['flex flex-1 items-center justify-center text-sm text-neutral-400']">
          Chat. Last event: {{ lastEvent }}
        </div>
      </div>
    </Variant>
    <Variant id="names" title="With names">
      <div :class="['h-96 flex bg-neutral-50 dark:bg-neutral-950']">
        <CharacterRail labels :class="['shrink-0 bg-neutral-100/60 dark:bg-neutral-900/60']" @switched="id => lastEvent = `switched ${id}`" @manage="lastEvent = 'manage'" />
        <div :class="['flex flex-1 items-center justify-center text-sm text-neutral-400']">
          Chat. Last event: {{ lastEvent }}
        </div>
      </div>
    </Variant>
  </Story>
</template>
