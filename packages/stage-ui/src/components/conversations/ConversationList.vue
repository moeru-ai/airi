<script setup lang="ts">
import { storeToRefs } from 'pinia'

import ConversationListItem from './ConversationListItem.vue'

import { useConversationStore } from '../../stores/conversations'

const emit = defineEmits<{
  create: []
}>()
const conversationStore = useConversationStore()
const { sortedConversations, activeConversationId } = storeToRefs(conversationStore)

function handleSelect(id: string) {
  conversationStore.setActiveConversation(id)
}
</script>

<template>
  <div flex="~ col" h-full>
    <!-- Header -->
    <div flex items-center justify-between px-3 py-2>
      <span text-sm text-gray-200 font-semibold>Conversations</span>
      <button
                /  10 h-7 w-7 flex items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white hover:text-white
        @click="emit('create')"
      >
        <div i-carbon-add text-lg />
      </button>
    </div>

    <!-- List -->
    <div flex-1 overflow-y-auto px-1>
      <template v-if="sortedConversations.length === 0">
        <div flex items-center justify-center py-8 text-sm text-gray-500>
          No conversations yet
        </div>
      </template>
      <ConversationListItem
        v-for="conv in sortedConversations"
        :key="conv.id"
        :conversation="conv"
        :active="conv.id === activeConversationId"
        @select="handleSelect"
      />
    </div>
  </div>
</template>
