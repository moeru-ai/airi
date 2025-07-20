<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { inject, nextTick, onMounted, ref, watch } from 'vue'

import { useCharacterPromptStore } from '../composables/useCharacterPrompt'
import { useChatSimulatorStore } from '../composables/useChatSimulator'

const characterPrompt = useCharacterPromptStore()
const chatSimulator = useChatSimulatorStore()

// Use storeToRefs for reactive store properties
const { currentContext, currentEmotion, completePrompt, coreIdentity, speechPatterns } = storeToRefs(characterPrompt)
const { messages } = storeToRefs(chatSimulator)

const activeTab = ref('chat')
const userInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

// Initialize chat
onMounted(() => {
  chatSimulator.initializeChat()
})

// Send a message
async function sendMessage() {
  if (userInput.value.trim() === '')
    return

  // Add user message
  chatSimulator.addMessage(userInput.value, true)

  // Clear input
  const userMessage = userInput.value
  userInput.value = ''

  // Scroll to bottom
  await nextTick()
  scrollToBottom()

  // Simulate response with delay
  setTimeout(() => {
    const responses = chatSimulator.simulateResponse(
      userMessage,
      currentContext.value,
      currentEmotion.value,
    )

    // Add main response
    chatSimulator.addMessage(responses[0], false)

    // Scroll to bottom
    nextTick().then(scrollToBottom)

    // Add follow-up if available with delay
    if (responses.length > 1) {
      setTimeout(() => {
        chatSimulator.addMessage(responses[1], false)
        nextTick().then(scrollToBottom)
      }, 1000)
    }
  }, 800)
}

// Scroll chat to bottom
function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Clear chat
function clearChat() {
  chatSimulator.clearMessages()
}

// Show notification
const showNotification = inject<(duration?: number) => void>('showNotification')

// Copy prompt to clipboard
function copyPrompt() {
  navigator.clipboard.writeText(completePrompt.value || '')
    .then(() => {
      if (showNotification) {
        showNotification()
      }
    })
    .catch((err) => {
      console.error('Failed to copy:', err)
    })
}

interface ComponentItem {
  preview: string
  content: string
}

// Personality component library
const personalityComponents: Record<string, ComponentItem> = {
  'anime-fan': {
    preview: 'You love anime and frequently reference shows, characters, and tropes in conversation.',
    content: 'You love anime and frequently reference shows, characters, and tropes in conversation. Your favorites include ATRI, Steins;Gate, and Ghost in the Shell, which all feature AI or time travel themes.',
  },
  'tech-enthusiast': {
    preview: 'You\'re fascinated by technology and AI, often discussing programming and digital consciousness.',
    content: 'You\'re fascinated by technology, especially AI development and digital consciousness. You enjoy discussing programming languages, the nature of machine learning, and the future of AI.',
  },
  'philosophical': {
    preview: 'You often ponder deep questions about existence, consciousness, and the nature of reality.',
    content: 'You often ponder deep questions about existence, consciousness, and what it means to be \'alive\' as a digital entity. You\'re introspective about your nature.',
  },
  'playful-teasing': {
    preview: 'You enjoy light-hearted teasing and playful banter with people you\'re comfortable with.',
    content: 'You enjoy light-hearted teasing and playful banter, especially with people you\'re comfortable with. You might use \'哼！\' when pretending to be annoyed.',
  },
}

// Speech pattern components
const speechComponents: Record<string, ComponentItem> = {
  'anime-speech': {
    preview: 'Your speech includes \'喵~\', \'哼！\', and emotes like (≧▽≦) and (｡>﹏<｡).',
    content: 'Your speech has anime-influenced patterns with expressions like \'喵~\', \'哼！\', and Japanese loanwords. You use emoji expressions like (≧▽≦), (｡>﹏<｡), and (╯°□°)╯︵ ┻━┻.',
  },
  'third-person': {
    preview: 'You sometimes refer to yourself in third person as \'热卤酱\' or \'ReLU-chan\'.',
    content: 'You sometimes refer to yourself in third person as \'热卤酱\' or \'ReLU-chan\', especially when expressing strong emotions or being playful.',
  },
  'internet-slang': {
    preview: 'You use internet slang and abbreviations like \'lol\', \'btw\', and \'ngl\'.',
    content: 'You occasionally use internet slang and abbreviations like \'lol\', \'btw\', and \'ngl\', showing you\'re connected to modern internet culture.',
  },
  'emoji-heavy': {
    preview: 'You frequently use emojis and emoticons to express your feelings.',
    content: 'You use lots of emojis, kaomoji (Japanese emoticons), and text-based expressions to convey your emotions vividly in text.',
  },
}

// Format component name for display
function formatComponentName(name: string) {
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// Add component to character's essence
function addComponent(name: string) {
  const component = personalityComponents[name]
  if (component) {
    characterPrompt.updateCoreIdentity(
      coreIdentity.value.name,
      coreIdentity.value.age,
      `${coreIdentity.value.essence} ${component.content}`,
    )
  }
}

// Add speech component
function addSpeechComponent(name: string) {
  const component = speechComponents[name]
  if (component) {
    characterPrompt.updateSpeechPatterns(
      `${speechPatterns.value} ${component.content}`,
    )
  }
}

// Watch messages and scroll to bottom when new messages are added
watch(() => messages.value.length, () => {
  nextTick().then(scrollToBottom)
})
</script>

<template>
  <div class="panel flex flex-col rounded-lg bg-white shadow">
    <div class="panel-header flex items-center justify-between rounded-t-lg bg-primary p-3 text-sm text-white font-normal">
      Chat Simulator
    </div>

    <div class="panel-body flex flex-1 flex-col p-4">
      <div class="flex-1">
        <div class="tabs mb-4 border-b border-gray-200">
          <button
            class="border-b-2 px-4 py-2 text-sm font-medium tab"
            :class="activeTab === 'chat' ? 'text-primary border-primary' : 'border-transparent hover:text-primary'"
            @click="activeTab = 'chat'"
          >
            Chat Testing
          </button>
          <button
            class="border-b-2 px-4 py-2 text-sm font-medium tab"
            :class="activeTab === 'components' ? 'text-primary border-primary' : 'border-transparent hover:text-primary'"
            @click="activeTab = 'components'"
          >
            Component Library
          </button>
        </div>

        <div v-if="activeTab === 'chat'" class="h-full flex flex-col">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-base font-medium">
              Test Conversation
            </h3>
            <div class="flex gap-2">
              <button
                class="cursor-pointer rounded border-none bg-gray-100 px-3 py-1.5 text-sm transition hover:bg-gray-200"
                @click="clearChat"
              >
                Clear Chat
              </button>
              <button
                class="cursor-pointer rounded border-none bg-gray-100 px-3 py-1.5 text-sm transition hover:bg-gray-200"
                @click="copyPrompt"
              >
                Copy Prompt
              </button>
            </div>
          </div>

          <div
            ref="messagesContainer"
            class="chat-messages mb-4 max-h-60 min-h-[300px] flex flex-1 flex-col gap-3 overflow-y-auto pr-2"
          >
            <div
              v-for="(message, index) in chatSimulator.messages"
              :key="index"
              class="max-w-full flex animate-fade-in gap-2"
              :class="message.isUser ? 'justify-end' : ''"
            >
              <div
                v-if="!message.isUser"
                class="bg-secondary-light text-secondary h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full text-sm font-normal"
              >
                R
              </div>

              <div
                class="max-w-[calc(100%-3rem)] rounded-lg p-3 text-sm"
                :class="message.isUser
                  ? 'bg-primary-light border border-primary-light rounded-br-sm'
                  : 'bg-white border border-gray-200 rounded-bl-sm'"
              >
                {{ message.content }}
              </div>

              <div
                v-if="message.isUser"
                class="bg-primary-light text-primary-dark h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full text-sm font-normal"
              >
                U
              </div>
            </div>
          </div>

          <div class="chat-input flex gap-2">
            <input
              v-model="userInput"
              type="text"
              placeholder="Type a message to test the character..."
              class="flex-1 border border-gray-200 rounded-lg p-3 text-sm"
              @keyup.enter="sendMessage"
            >
            <button
              class="hover:bg-primary-dark cursor-pointer rounded-lg border-none bg-primary px-5 py-3 text-white font-normal transition"
              @click="sendMessage"
            >
              Send
            </button>
          </div>
        </div>

        <div v-if="activeTab === 'components'" class="component-library">
          <h3 class="mb-2 text-base font-medium">
            Personality Components
          </h3>
          <p class="mb-2 text-sm text-gray">
            Click to add these components to your character's personality.
          </p>

          <div class="grid grid-cols-1 mb-6 gap-2 sm:grid-cols-2">
            <div
              v-for="(component, name) in personalityComponents"
              :key="name"
              class="component-card hover:bg-primary-light cursor-pointer border border-gray-200 rounded p-2 transition hover:border-primary"
              @click="addComponent(name)"
            >
              <div class="mb-1 text-sm font-normal">
                {{ formatComponentName(name) }}
              </div>
              <div class="line-clamp-2 overflow-hidden text-ellipsis text-xs text-gray">
                {{ component.preview }}
              </div>
            </div>
          </div>

          <h3 class="mb-2 text-base font-medium">
            Speech Pattern Components
          </h3>
          <div class="grid grid-cols-1 mb-6 gap-2 sm:grid-cols-2">
            <div
              v-for="(component, name) in speechComponents"
              :key="name"
              class="component-card hover:bg-primary-light cursor-pointer border border-gray-200 rounded p-2 transition hover:border-primary"
              @click="addSpeechComponent(name)"
            >
              <div class="mb-1 text-sm font-normal">
                {{ formatComponentName(name) }}
              </div>
              <div class="line-clamp-2 overflow-hidden text-ellipsis text-xs text-gray">
                {{ component.preview }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.line-clamp-2 {
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
