<script setup lang="ts">
import { ref } from 'vue'

import { useConversationStore } from '../../stores/conversations'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [id: string]
}>()

const conversationStore = useConversationStore()

const title = ref('')
const type = ref<'bot' | 'group'>('bot')
const creating = ref(false)

async function handleCreate() {
  creating.value = true
  try {
    const id = await conversationStore.createConversation({
      type: type.value,
      title: title.value || undefined,
    })
    title.value = ''
    emit('created', id)
    emit('update:open', false)
  }
  catch (err) {
    console.error('Failed to create conversation:', err)
  }
  finally {
    creating.value = false
  }
}

function handleClose() {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
            / 50 fixed inset-0 z-50 flex items-center justify-center bg-black
      @click.self="handleClose"
    >
      <div
        w-96 rounded-xl bg-gray-800 p-6 shadow-xl
      >
        <h3 mb-4 text-lg text-white font-semibold>
          New Conversation
        </h3>

        <!-- Type selector -->
        <div mb-4>
          <label mb-1 block text-sm text-gray-400>Type</label>
          <div flex gap-2>
            <button
              flex-1 rounded-lg px-3 py-2 text-sm transition-colors
              :class="type === 'bot' ? 'bg-primary-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'"
              @click="type = 'bot'"
            >
              AI Chat
            </button>
            <button
              flex-1 rounded-lg px-3 py-2 text-sm transition-colors
              :class="type === 'group' ? 'bg-primary-500 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'"
              @click="type = 'group'"
            >
              Group
            </button>
          </div>
        </div>

        <!-- Title -->
        <div mb-4>
          <label mb-1 block text-sm text-gray-400>Title (optional)</label>
          <input
            v-model="title"
              /         10 w-full rounded-lg bg-white px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-primary-500 placeholder-gray-500
            placeholder="Enter a title..."
          >
        </div>

        <!-- Actions -->
        <div flex justify-end gap-2>
          <button
            rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            rounded-lg bg-primary-500 px-4 py-2 text-sm text-white transition-colors hover:bg-primary-600
            :disabled="creating"
            @click="handleCreate"
          >
            {{ creating ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
