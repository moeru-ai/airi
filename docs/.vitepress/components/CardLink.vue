<script setup lang="ts">
import { AspectRatio } from 'reka-ui'

defineProps<{
  title: string
  description?: string
  url: string
  image?: string
}>()
</script>

<template>
  <div class="h-full">
    <a
      class="bg-card border-muted h-full flex flex-col border rounded-2xl p-4 hover:border-primary"
      target="_blank"
      :href="url"
    >
      <h5 class="font-bold">{{ title }}</h5>
      <p class="text-muted-foreground my-1 flex-1 text-sm">{{ description }}</p>

      <AspectRatio
        v-if="image"
        :ratio="16 / 9"
        class="border-muted mt-2 overflow-hidden border rounded-lg"
      >
        <img
          class="h-full w-full object-cover"
          :src="image"
          :alt="title"
        >
      </AspectRatio>

    </a>
  </div>
</template>
