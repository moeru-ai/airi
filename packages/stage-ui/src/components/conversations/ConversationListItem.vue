<script setup lang="ts">
import type { LocalConversation } from '../../types/conversation'

import { computed } from 'vue'

const props = defineProps<{
  conversation: LocalConversation
  active?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const displayTitle = computed(() => {
  if (props.conversation.title)
    return props.conversation.title
  if (props.conversation.type === 'bot')
    return 'AI Chat'
  return 'Untitled'
})

const timeAgo = computed(() => {
  const time = props.conversation.lastMessageAt ?? props.conversation.createdAt
  if (!time)
    return ''
  const diff = Date.now() - new Date(time).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1)
    return 'now'
  if (minutes < 60)
    return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
})

const typeIcon = computed(() => {
  switch (props.conversation.type) {
    case 'bot': return 'i-carbon-bot'
    case 'group': return 'i-carbon-group'
    case 'channel': return 'i-carbon-hashtag'
    default: return 'i-carbon-chat'
  }
})
</script>

<template>
  <button
    w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors
    :class="active ? 'bg-primary-500/20 text-primary-500' : 'hover:bg-white/5 text-gray-300'"
    @click="emit('select', conversation.id)"
  >
    <!-- Icon -->
    <div
      h-10 w-10 flex shrink-0 items-center justify-center rounded-full
      :class="active ? 'bg-primary-500/30' : 'bg-white/10'"
    >
      <div :class="typeIcon" text-lg />
    </div>

    <!-- Content -->
    <div min-w-0 flex-1>
      <div flex items-center justify-between>
        <span truncate text-sm font-medium>{{ displayTitle }}</span>
        <span text-xs text-gray-500>{{ timeAgo }}</span>
      </div>
      <div flex items-center justify-between>
        <span truncate text-xs text-gray-500>
          {{ conversation.lastMessagePreview || 'No messages yet' }}
        </span>
        <!-- Unread badge -->
        <span
          v-if="conversation.unreadCount > 0"
          min-w-5 flex items-center justify-center rounded-full bg-primary-500 px-1.5 py-0.5 text-xs text-white font-bold
        >
          {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
        </span>
      </div>
    </div>
  </button>
</template>
