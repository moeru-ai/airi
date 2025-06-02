<script setup lang="ts">
import { Rive } from '@rive-app/canvas-lite'
import { onMounted, ref, watch } from 'vue'

import CircleFadeInAnimation from './assets/circle_blink_in_bold_-_loading_(@proj-airi).riv?url'
import CRT from './CRT.vue'
import CRTLine from './CRTLine.vue'

interface WriteLineOptions {
  renderSpeed?: number
  pending?: boolean
  onPendingCheck?: () => Promise<boolean>
}

interface ConsoleEntry {
  id: number
  content: string
  timestamp: number
  status?: 'pending' | 'ok' | 'error'
  error?: string
  isTyping?: boolean
  targetContent?: string
}

const step = ref<string>('')
const progress = ref<number>(0)
const done = ref<boolean>(false)
const consoleEntries = ref<ConsoleEntry[]>([])
const pendingAnimationFrame = ref(0)
const currentEntryId = ref(0)
const defaultTypingSpeed = ref<number>(20)
const timeMultiplier = ref<number>(1.0)

const PENDING_FRAMES = [
  '[...   ]',
  '[ ...  ]',
  '[  ... ]',
  '[   ...]',
  '[  ... ]',
  '[ ...  ]',
]

interface BootMessage {
  template: string
  typingSpeed?: number
}

const bootMessages: BootMessage[] = [
  {
    template: `Project AIRI version ${import.meta.env.VITE_AIRI_VERSION || '1.0.0'} ${import.meta.env.VITE_AIRI_COMMIT || '0240602'}`,
    typingSpeed: 15,
  },
  {
    template: 'Command line: BOOT_IMAGE=/boot/airi.moeru.ai root=UUID=airi-system',
    typingSpeed: 10,
  },
  {
    template: 'moeru-ai/NPU: Initialized power management',
    typingSpeed: 20,
  },
  {
    template: 'Initializing AIRI subsystems...',
    typingSpeed: 30,
  },
  {
    template: 'Loading initial ramdisk...',
    typingSpeed: 25,
  },
  {
    template: 'Starting system services',
    typingSpeed: 20,
  },
  {
    template: 'AIRI core services initialized',
    typingSpeed: 20,
  },
  {
    template: 'Neural processing units detected',
    typingSpeed: 20,
  },
  {
    template: 'Quantum interface online',
    typingSpeed: 15,
  },
  {
    template: 'Consciousness waking up...',
    typingSpeed: 40,
  },
  {
    template: 'Consciousness fully awakened',
    typingSpeed: 35,
  },
  {
    template: 'Initiating Speech Recognition subsystem',
    typingSpeed: 25,
  },
  {
    template: 'Speech recognition online',
    typingSpeed: 25,
  },
  {
    template: 'Initiating Speaker voice',
    typingSpeed: 25,
  },
  {
    template: 'Speaker voice line tuned',
    typingSpeed: 25,
  },
  {
    template: 'Initiating Vision downlink',
    typingSpeed: 25,
  },
  {
    template: 'Vision downlink offline',
    typingSpeed: 25,
  },
  {
    template: 'AIRI ready',
    typingSpeed: 50,
  },
]

const riveCanvas = ref<HTMLCanvasElement>()
const crtRef = ref<InstanceType<typeof CRT>>()

function getTimestamp(): number {
  return performance.now() / 1000 * timeMultiplier.value
}

function formatTimestamp(time: number): string {
  return time.toFixed(6).padStart(10, ' ')
}

function handleUpdateStep(value: string) {
  step.value = value
}

function handleUpdateProgress(value: number) {
  progress.value = value
}

function handleUpdateDone(value: boolean) {
  done.value = value
}

// Method to update typing speed for a specific message
function setMessageTypingSpeed(index: number, speed: number) {
  if (index >= 0 && index < bootMessages.length && speed > 0) {
    bootMessages[index].typingSpeed = speed
  }
}

// Method to update default typing speed
function setDefaultTypingSpeed(speed: number) {
  if (speed > 0) {
    defaultTypingSpeed.value = speed
  }
}

// Method to update time progression speed
function setTimeSpeed(multiplier: number) {
  if (multiplier > 0) {
    timeMultiplier.value = multiplier
  }
}

async function typeCharacters(entry: ConsoleEntry, text: string, speed: number) {
  entry.isTyping = true
  entry.targetContent = text

  for (let i = 0; i <= text.length; i++) {
    if (!entry.isTyping)
      break // Allow for interruption
    entry.content = text.slice(0, i)
    await new Promise(resolve => setTimeout(resolve, speed))
  }

  entry.isTyping = false
  entry.content = text // Ensure final state is complete
}

async function writeLine<T extends any[]>(
  format: string,
  ...args: [...T, WriteLineOptions?]
): Promise<void> {
  const options = args.length > 0 && typeof args[args.length - 1] === 'object'
    ? args.pop() as WriteLineOptions
    : {}

  const { renderSpeed = defaultTypingSpeed.value, pending = false, onPendingCheck } = options
  const entryId = ++currentEntryId.value
  const timestamp = getTimestamp()

  // Format the message with args
  const formattedArgs = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
  )
  const message = format.replace(/%[sdjo]/g, () => formattedArgs.shift() || '')
  const timestampStr = `[${formatTimestamp(timestamp)}] `
  const fullLine = timestampStr + message

  // Create initial entry
  const entry: ConsoleEntry = {
    id: entryId,
    content: '',
    timestamp,
    status: pending ? 'pending' : undefined,
    isTyping: false,
    targetContent: fullLine,
  }

  consoleEntries.value.push(entry)

  // Handle pending animation and check
  if (pending && onPendingCheck) {
    let frame = 0
    const animateAndCheck = async () => {
      const currentEntry = consoleEntries.value.find(e => e.id === entryId)
      if (!currentEntry)
        return

      // Update pending animation frame
      currentEntry.content = `${fullLine} ${PENDING_FRAMES[frame % PENDING_FRAMES.length]}`
      frame++

      try {
        const result = await onPendingCheck()
        if (result) {
          currentEntry.status = 'ok'
          currentEntry.content = `${fullLine} [ OK ]`
        }
        else {
          // Continue animation if not ready
          pendingAnimationFrame.value = requestAnimationFrame(() => animateAndCheck())
        }
      }
      catch (error) {
        currentEntry.status = 'error'
        currentEntry.error = error instanceof Error ? error.message : String(error)
        currentEntry.content = `${fullLine} [ ERROR ]`
      }
    }

    await animateAndCheck()
  }
  else {
    // Type out the message character by character
    await typeCharacters(entry, fullLine, renderSpeed)
  }
}

onMounted(async () => {
  riveCanvas.value.width = Math.max(window.innerWidth, 500) * 2
  riveCanvas.value.height = Math.max(window.innerWidth, 500) * 2

  const _ = new Rive({
    src: CircleFadeInAnimation,
    canvas: riveCanvas.value,
    autoplay: true,
  })

  // Boot sequence
  for (const message of bootMessages) {
    await writeLine(message.template, { renderSpeed: message.typingSpeed || defaultTypingSpeed.value })
  }
})

watch(consoleEntries, () => crtRef.value && crtRef.value.handleWriteLine(), { deep: true })

defineExpose({
  handleUpdateStep,
  handleUpdateProgress,
  handleUpdateDone,
  setMessageTypingSpeed,
  setDefaultTypingSpeed,
  setTimeSpeed,
  writeLine,
})
</script>

<template>
  <Transition name="fade-out">
    <div v-if="!done" w="[100dvw]" h="[100dvh]" font-retro-mono absolute inset-0 z-99 flex items-center justify-center>
      <div flex flex-col max-w="800px" w="full" p="4">
        <div w="[min(200px,50dvw)]" h="[min(200px,50dvw)]" mx-auto flex justify-center overflow-hidden>
          <canvas ref="riveCanvas" object-contain />
        </div>
        <CRT ref="crtRef">
          <CRTLine v-for="entry in consoleEntries" :key="entry.id">
            {{ entry.content }}
          </CRTLine>
        </CRT>
      </div>
    </div>
  </Transition>
</template>
