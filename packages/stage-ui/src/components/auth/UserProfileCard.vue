<template>
  <div class="mx-auto max-w-sm rounded-lg bg-white/50 p-4 backdrop-blur-sm dark:bg-black/50">
    <div class="flex items-center gap-4">
      <img :src="user.avatar || defaultAvatar" alt="avatar" class="h-12 w-12 rounded-full object-cover">
      <div>
        <div class="font-semibold">{{ user.name || 'Unknown' }}</div>
        <div class="text-muted text-sm">{{ user.email }}</div>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <Button label="Edit profile" variant="secondary" block @click="$emit('edit')" />
      <Button label="Log out" variant="pure" block @click="$emit('logout')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@proj-airi/ui'

const props = defineProps<{ user: { name?: string; email?: string; avatar?: string } }>()
const emit = defineEmits<{ (e: 'edit'): void; (e: 'logout'): void }>()

const defaultAvatar = computed(
  () =>
    `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23e5e7eb'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='24'>👤</text></svg>`
)

const user = props.user
</script>

<style scoped>
.text-muted{color:var(--un-text-muted,#6b7280)}
</style>
