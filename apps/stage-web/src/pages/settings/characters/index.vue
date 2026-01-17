<script setup lang="ts">
import type { Character } from '@proj-airi/stage-ui/types/character'

import { useCharacterStore } from '@proj-airi/stage-ui/stores/characters'
import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'

import CharacterDialog from './components/CharacterDialog.vue'
import CharacterItem from './components/CharacterItem.vue'

const characterStore = useCharacterStore()
const { characters } = storeToRefs(characterStore)

// Fetch on mount
onMounted(() => {
  characterStore.fetchList().catch(console.error)
})

// Search
const searchQuery = ref('')
const filteredCharacters = computed(() => {
  const query = searchQuery.value.toLowerCase()
  return Array.from(characters.value.values()).filter((char) => {
    const i18n = char.i18n?.find(i => i.language === 'en') || char.i18n?.[0]
    return i18n?.name.toLowerCase().includes(query) || i18n?.description.toLowerCase().includes(query)
  })
})

// Selection / Dialog
const isDialogOpen = ref(false)
const selectedCharacter = ref<Character | undefined>(undefined)

function handleCreate() {
  selectedCharacter.value = undefined
  isDialogOpen.value = true
}

function handleEdit(char: Character) {
  selectedCharacter.value = char
  isDialogOpen.value = true
}

function handleDelete(id: string) {
  // TODO: Remove this
  // eslint-disable-next-line no-alert
  if (confirm('Are you sure you want to delete this character?')) {
    characterStore.remove(id).catch(console.error)
  }
}

function handleActivate(char: Character) {
  // TODO: Implement activation logic (global store for active character)
  // eslint-disable-next-line no-console
  console.log('Activate', char.id)
}
</script>

<template>
  <div class="h-full flex flex-col gap-4 p-4 md:p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl text-neutral-900 font-bold dark:text-neutral-100">
          Characters
        </h1>
        <p class="mt-1 text-neutral-500 dark:text-neutral-400">
          Manage your AI characters and their capabilities.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <FieldInput
          v-model="searchQuery"
          placeholder="Search..."
          class="w-64"
        />
        <Button @click="handleCreate">
          <div class="i-solar:add-circle-bold mr-2" />
          Create New
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="characters.size === 0" class="flex flex-1 items-center justify-center">
      <div class="i-svg-spinners:90-ring-with-bg text-4xl text-primary-500" />
    </div>

    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 pb-20 lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-5"
    >
      <!-- Create Card (Visual) -->
      <button
        class="group relative min-h-120px flex flex-col cursor-pointer items-center justify-center gap-3 overflow-hidden border-2 border-neutral-200 rounded-xl border-dashed bg-neutral-50/50 p-6 transition-all duration-300 dark:border-neutral-800 hover:border-primary-400 dark:bg-neutral-900/20 hover:bg-primary-50/30 dark:hover:border-primary-600 dark:hover:bg-primary-900/10"
        @click="handleCreate"
      >
        <div class="i-solar:add-circle-linear text-5xl text-neutral-300 transition-colors dark:text-neutral-700 group-hover:text-primary-400 dark:group-hover:text-primary-500" />
        <span class="text-neutral-500 font-medium transition-colors dark:text-neutral-500 group-hover:text-primary-600 dark:group-hover:text-primary-400">
          Create Character
        </span>
      </button>

      <!-- Items -->
      <CharacterItem
        v-for="char in filteredCharacters"
        :key="char.id"
        :character="char"
        :is-active="false"
        :is-selected="selectedCharacter?.id === char.id"
        @select="handleEdit(char)"
        @activate="handleActivate(char)"
        @delete="handleDelete(char.id)"
      />
    </div>

    <CharacterDialog
      v-model="isDialogOpen"
      :character="selectedCharacter"
      @submit="characterStore.fetchList()"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Characters
  subtitleKey: settings.title
</route>
