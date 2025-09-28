<script setup lang="ts">
import { nextTick, onMounted, provide, ref, watch } from 'vue'

interface ReplayableProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center'
  autoReplay?: boolean
  replayInterval?: number
  showLabel?: boolean
  disabled?: boolean
  hotkey?: string
}

const props = withDefaults(defineProps<ReplayableProps>(), {
  position: 'top-right',
  autoReplay: false,
  replayInterval: 3000,
  showLabel: false,
  disabled: false,
  hotkey: 'r',
})

const emit = defineEmits<{
  replay: []
  beforeReplay: []
  afterReplay: []
}>()

// State
const isReplaying = ref(false)
const replayCount = ref(0)
const containerRef = ref<HTMLElement>()
const autoReplayTimer = ref<NodeJS.Timeout>()

// Replay callbacks registry
const replayCallbacks = ref<Array<() => void | Promise<void>>>([])

// Provide replay functionality to child components
function registerReplayCallback(callback: () => void | Promise<void>) {
  replayCallbacks.value.push(callback)

  // Return unregister function
  return () => {
    const index = replayCallbacks.value.indexOf(callback)
    if (index > -1) {
      replayCallbacks.value.splice(index, 1)
    }
  }
}

provide('replayable', {
  registerReplayCallback,
  isReplaying: () => isReplaying.value,
})

// Replay function
async function replay() {
  if (isReplaying.value || props.disabled)
    return

  isReplaying.value = true
  replayCount.value++

  emit('beforeReplay')

  try {
    // Execute all registered replay callbacks
    await Promise.all(replayCallbacks.value.map(callback => callback()))

    // Small delay to ensure animations complete
    await nextTick()

    emit('replay')
  }
  catch (error) {
    console.error('Error during replay:', error)
  }
  finally {
    isReplaying.value = false
    emit('afterReplay')
  }
}

// Auto replay functionality
function startAutoReplay() {
  if (!props.autoReplay)
    return

  autoReplayTimer.value = setInterval(() => {
    replay()
  }, props.replayInterval)
}

function stopAutoReplay() {
  if (autoReplayTimer.value) {
    clearInterval(autoReplayTimer.value)
    autoReplayTimer.value = undefined
  }
}

// Hotkey support
function handleKeydown(event: KeyboardEvent) {
  if (event.key.toLowerCase() === props.hotkey.toLowerCase() && !event.metaKey && !event.ctrlKey) {
    event.preventDefault()
    replay()
  }
}

// Lifecycle
onMounted(() => {
  if (props.autoReplay) {
    startAutoReplay()
  }

  if (props.hotkey) {
    document.addEventListener('keydown', handleKeydown)
  }
})

watch(() => props.autoReplay, (newVal) => {
  if (newVal) {
    startAutoReplay()
  }
  else {
    stopAutoReplay()
  }
})

watch(() => props.replayInterval, () => {
  if (props.autoReplay) {
    stopAutoReplay()
    startAutoReplay()
  }
})

// Expose methods for external control
defineExpose({
  replay,
  startAutoReplay,
  stopAutoReplay,
  replayCount: () => replayCount.value,
  isReplaying: () => isReplaying.value,
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative inline-block h-full w-full"
  >
    <!-- Slot content -->
    <div class="relative z-1">
      <slot />
    </div>

    <!-- Replay button -->
    <button
      class="absolute z-10 flex cursor-pointer items-center gap-1 rounded-lg border-none p-1 backdrop-blur-md"
      bg="neutral-300/50 dark:neutral-600/50 hover:neutral-300/60 dark:hover:neutral-600/60 focus:outline-none"
      transition="all duration-150 ease-in-out"
      :class="[
        disabled || isReplaying ? 'opacity-50 cursor-not-allowed' : '',
        position === 'top-right' ? 'top-1 right-1'
        : position === 'top-left' ? 'top-1 left-1'
          : position === 'bottom-right' ? 'bottom-1 right-1'
            : position === 'bottom-left' ? 'bottom-1 left-1'
              : position === 'center' ? 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2' : '',
      ]"
      :disabled="disabled || isReplaying"
      :title="`Replay animation${hotkey ? ` (${hotkey.toUpperCase()})` : ''}`"
      type="button"
      @click="replay"
    >
      <div i-solar:play-circle-bold-duotone h-4 w-4 flex-shrink-0 text="neutral-500 dark:neutral-400" :class="[isReplaying ? 'animate-spin' : '']" />

      <!-- Label -->
      <span v-if="showLabel" text-nowrap>
        {{ isReplaying ? 'Replaying...' : 'Replay' }}
      </span>
    </button>

    <!-- Auto replay indicator -->
    <div
      v-if="autoReplay"
      class="replayable-auto-indicator"
      :title="`Auto replay every ${replayInterval}ms`"
    >
      <div class="replayable-auto-pulse" />
    </div>
  </div>
</template>
