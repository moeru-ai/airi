<script setup lang="ts">
import CharacterShowcase from './CharacterShowcase.vue'

defineProps<{
  characters: string[]
}>()
</script>

<template>
  <div flex="~ row justify-center items-start gap-1">
    <template v-for="(char, i) in characters" :key="i">
      <CharacterShowcase
        :value="char"
        code-point
      />
      <CharacterShowcase
        v-if="i < characters.length - 1"
        value="+"
        invisible-code-point
        variant="connector"
      />
    </template>
    <CharacterShowcase
      value="="
      invisible-code-point
      variant="connector"
    />
    <CharacterShowcase
      :value="characters.join('')"
      code-point
      variant="active"
    />
  </div>
</template>
