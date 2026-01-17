<script setup lang="ts">
import { useWebSocketInspectorStore } from '@proj-airi/stage-ui/stores/devtools/websocket-inspector'
import { Button, FieldCheckbox, Input } from '@proj-airi/ui'
import { computed, nextTick, ref, watch } from 'vue'

const store = useWebSocketInspectorStore()

const filter = ref('')
const showIncoming = ref(true)
const showOutgoing = ref(true)
const showHeartbeats = ref(true)
const streamContainer = ref<HTMLDivElement>()
const showingDetails = ref<string>('')
const filteredHistory = computed(() => {
  return store.history.filter((item) => {
    if (!showIncoming.value && item.direction === 'incoming')
      return false
    if (!showOutgoing.value && item.direction === 'outgoing')
      return false
    if (!showHeartbeats.value && item.event.type === 'transport:connection:heartbeat')
      return false
    if (filter.value && !JSON.stringify(item.event).toLowerCase().includes(filter.value.toLowerCase()))
      return false
    return true
  })
})

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

async function scrollToTop() {
  await nextTick()
  if (streamContainer.value)
    streamContainer.value.scrollTop = 0
}

watch(() => filteredHistory.value.length, scrollToTop)

const directionBadgeClassMap: Record<'incoming' | 'outgoing', string[]> = {
  incoming: [
    'bg-pink-100 dark:bg-pink-900',
    'text-pink-600',
    'dark:text-pink-300',
    'border-pink-300 dark:border-pink-900',
  ],
  outgoing: [
    'bg-blue-100 dark:bg-blue-900',
    'text-blue-600',
    'dark:text-blue-300',
    'border-blue-300 dark:border-blue-900',
  ],
}

const directionIconClassMap: Record<'incoming' | 'outgoing', string> = {
  incoming: 'i-solar:arrow-down-linear',
  outgoing: 'i-solar:arrow-up-linear',
}

function directionBadgeClasses(direction: 'incoming' | 'outgoing') {
  return directionBadgeClassMap[direction]
}

function directionIconClass(direction: 'incoming' | 'outgoing') {
  return directionIconClassMap[direction]
}

const cardClassMap: Record<'incoming' | 'outgoing', string[]> = {
  incoming: [
    'bg-pink-50',
    'dark:bg-pink-950',
    'border-pink-300',
    'text-pink-700',
    'dark:border-pink-800',
    'dark:text-pink-100',
  ],
  outgoing: [
    'bg-blue-50',
    'dark:bg-blue-950',
    'border-blue-300',
    'text-blue-700',
    'dark:border-blue-800',
    'dark:text-blue-100',
  ],
}

function cardClasses(direction: 'incoming' | 'outgoing') {
  return cardClassMap[direction]
}

const payloadClassMap: Record<'incoming' | 'outgoing', string[]> = {
  incoming: [
    'bg-pink-100',
    'border-pink-300 border-1 border-solid',
    'dark:bg-pink-900',
    'dark:border-pink-700',
  ],
  outgoing: [
    'bg-blue-100',
    'border-blue-300 border-1 border-solid',
    'dark:bg-blue-900',
    'dark:border-blue-700',
  ],
}

function payloadClasses(direction: 'incoming' | 'outgoing') {
  return payloadClassMap[direction]
}
</script>

<template>
  <div class="h-full flex flex-col gap-4 overflow-hidden p-4">
    <!-- Header / Filters -->
    <div class="flex flex-col gap-4 rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
      <div class="flex items-center gap-2">
        <FieldCheckbox v-model="showIncoming" label="Incoming" />
        <FieldCheckbox v-model="showOutgoing" label="Outgoing" />
        <FieldCheckbox v-model="showHeartbeats" label="Heartbeats" />
      </div>

      <div class="flex gap-2">
        <Input
          v-model="filter"
          placeholder="Filter payload..."
          class="w-64"
        />
        <Button
          label="Clear"
          icon="i-solar:trash-bin-trash-bold-duotone"
          size="sm"
          variant="ghost"
          @click="store.clear()"
        />
        <div class="flex flex-shrink-0 items-center text-xs">
          {{ filteredHistory.length }} / {{ store.history.length }}
        </div>
      </div>
    </div>

    <!-- Stream -->
    <div
      ref="streamContainer"
      class="flex-1 overflow-y-auto rounded-xl bg-white/70 dark:bg-neutral-950/50"
    >
      <div
        v-if="filteredHistory.length === 0"
        class="h-full w-full flex justify-center p-3 text-sm"
      >
        No messages found.
      </div>
      <div v-else v-auto-animate class="grid gap-3">
        <div
          v-for="item in filteredHistory"
          :key="item.id"
          class="border rounded-xl p-4 transition-colors"
          :class="cardClasses(item.direction)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', 'flex', 'items-center', 'justify-center', ...directionBadgeClasses(item.direction)]">
                <span :class="['size-3.5', directionIconClass(item.direction)]" :aria-label="item.direction" />
                <span class="ml-1 font-bold tracking-wider uppercase">{{ item.direction }}</span>
              </span>
              <span class="font-semibold">
                {{ item.event.type }}
              </span>
            </div>
            <span class="text-sm font-mono">
              {{ formatTime(item.timestamp) }}
            </span>
          </div>

          <details class="group mt-2" :open="showingDetails === item.id">
            <summary class="cursor-pointer select-none text-sm font-medium" @click="showingDetails = showingDetails === item.id ? '' : item.id">
              Payload
            </summary>
            <pre
              class="mt-2 w-full overflow-auto whitespace-pre-wrap rounded-lg p-3 text-sm"
              :class="payloadClasses(item.direction)"
            >{{ JSON.stringify(item.event, null, 2) }}</pre>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: WebSocket Inspector
  subtitleKey: tamagotchi.settings.devtools.title
</route>
