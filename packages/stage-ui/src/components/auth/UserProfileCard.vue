<template>
  <div class="max-w-sm mx-auto p-4 rounded-lg bg-white/50 dark:bg-black/50 backdrop-blur-sm">
    <div class="flex items-center gap-4">
      <img :src="user.avatar || defaultAvatar" alt="avatar" class="w-12 h-12 rounded-full object-cover" />
      <div>
        <div class="font-semibold">{{ user.name || 'Unknown' }}</div>
        <div class="text-sm text-muted">{{ user.email }}</div>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <button class="flex-1 px-3 py-2 rounded border" @click="$emit('edit')">Edit profile</button>
      <button class="flex-1 px-3 py-2 rounded btn-ghost" @click="$emit('logout')">Log out</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'

const props = defineProps<{ user: { name?: string; email?: string; avatar?: string } }>()

const defaultAvatar = computed(() => `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23e5e7eb'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='24'>👤</text></svg>`)

const user = props.user || {}
</script>

<style scoped>
.text-muted{color:var(--un-text-muted,#6b7280)}
.btn-ghost{background:transparent;border:1px solid rgba(0,0,0,0.06)}
</style>
