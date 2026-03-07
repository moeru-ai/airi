<script setup lang="ts">
import type { LocalConversation } from '../../types/conversation'

import { computed } from 'vue'

const props = defineProps<{
  conversation: LocalConversation
}>()

const memberCount = computed(() => props.conversation.members.length)

const typeLabel = computed(() => {
  switch (props.conversation.type) {
    case 'bot': return 'AI Chat'
    case 'group': return 'Group'
    case 'channel': return 'Channel'
    case 'private': return 'Private'
    default: return 'Chat'
  }
})
</script>

<template>
  <div p-4>
    <h3 mb-2 text-lg text-white font-semibold>
      {{ conversation.title || 'Untitled' }}
    </h3>
    <div mb-4 text-sm text-gray-400>
      {{ typeLabel }} · {{ memberCount }} member{{ memberCount !== 1 ? 's' : '' }}
    </div>

    <!-- Members -->
    <div>
      <h4 mb-2 text-sm text-gray-300 font-medium>
        Members
      </h4>
      <div flex="~ col" gap-1>
        <div
          v-for="member in conversation.members"
          :key="member.id"
          flex items-center gap-2 rounded-lg px-2 py-1.5
        >
          <div
                  / 10 h-6 w-6 flex items-center justify-center rounded-full bg-white
          >
            <div
              text-xs
              :class="member.memberType === 'user' ? 'i-carbon-user' : member.memberType === 'character' ? 'i-carbon-bot' : 'i-carbon-application'"
            />
          </div>
          <span text-sm text-gray-300>
            {{ member.userId ?? member.characterId ?? 'Unknown' }}
          </span>
          <span text-xs text-gray-500>{{ member.role }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
