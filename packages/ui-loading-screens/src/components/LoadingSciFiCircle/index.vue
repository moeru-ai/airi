<script setup lang="ts">
import type { Ref } from 'vue'

import { Rive } from '@rive-app/canvas-lite'
import { breakpointsTailwind, useBreakpoints, useDark } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'

import CircleFadeInAnimation from './assets/circle_blink_in_-_loading_(@proj-airi).riv'
import CRT from './CRT.vue'
import CRTLine from './CRTLine.vue'

interface WriteLineOptions {
  renderSpeed?: number
  pending?: boolean
  onPendingCheck?: () => Promise<boolean>
  withoutTimestamp?: boolean
}

interface ConsoleEntry {
  id: number
  content: string
  timestamp: number
  status?: 'pending' | 'ok' | 'error'
  error?: string
  isTyping?: boolean
  targetContent?: string
  class?: string
}

defineProps<{
  barrelDistortion?: boolean
}>()

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
  withoutTimestamp?: boolean
  pending?: boolean
  onPendingCheck?: () => Promise<boolean>
  class?: string
}

const breakpoints = useBreakpoints(breakpointsTailwind)
const isDeviceSm = computed(() => breakpoints.smaller('sm').value)

/**
 * Stick Letters
 *
 * From @link{https://www.asciiart.eu/text-to-ascii-art}
 */
const wideAsciiArt = computed(() => (`
 __   __   __    __  ___  __  ___            __
|__) |__) /  \\    | |__  /  \`  |      /\\  | |__) |
|    |  \\ \\__/ \\__/ |___ \\__,  |     /~~\\ | |  \\ |
`))

const narrowAsciiArt = computed(() => (`
 __                   __
|__)_ _ . _ _|_  /\\ ||__)|
|  | (_)|(-(_|_ /--\\|| \\ |
        /
`))

const projectAIRIAsciiArt = computed(() => {
  if (isDeviceSm.value)
    return narrowAsciiArt.value
  return wideAsciiArt.value
})

const projectAIRIMetadata = `
Project AIRI team from Moeru AI (https://moeru.ai) and other contributors
Open sourced on https://github.com/moeru-ai/airi
`

const bootMessages = computed<BootMessage[]>(() => [
  ...projectAIRIAsciiArt.value.split('\n').map(line => ({
    template: line,
    typingSpeed: 1,
    withoutTimestamp: true,
  })),
  {
    template: `Project AIRI version ${import.meta.env.VITE_AIRI_VERSION || '1.0.0'} @ ${import.meta.env.VITE_AIRI_COMMIT || '0240602'} build`,
    typingSpeed: 5,
    withoutTimestamp: true,
  },
  ...projectAIRIMetadata.trim().split('\n').map(line => ({
    template: line,
    typingSpeed: 1,
    withoutTimestamp: true,
  })),
  {
    template: '',
    typingSpeed: 1,
    withoutTimestamp: true,
  },
  {
    template: '',
    typingSpeed: 1,
    withoutTimestamp: true,
  },
  {
    template: 'Command line: BOOT_IMAGE=/boot/airi.moeru.ai root=UUID=io.github.moeru-ai.airi',
    typingSpeed: 1,
  },
  {
    template: 'moeru-ai/NPU: Initialized power management',
    typingSpeed: 1,
  },
  {
    template: 'Initializing AIRI subsystems...',
    typingSpeed: 1,
    pending: true,
    onPendingCheck: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 5000)
      })
    },
  },
  {
    template: 'Loading initial ramdisk...',
    typingSpeed: 1,
    pending: true,
    onPendingCheck: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 5000)
      })
    },
  },
  {
    template: 'Starting system services...',
    typingSpeed: 1,
    onPendingCheck: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 5000)
      })
    },
  },
  {
    template: 'AIRI core services initialized',
    typingSpeed: 1,
  },
  {
    template: 'Neural processing units detected',
    typingSpeed: 50,
  },
  {
    template: 'Quantum interface online',
    typingSpeed: 1,
  },
  {
    template: 'Consciousness waking up...',
    typingSpeed: 50,
    pending: true,
    onPendingCheck: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 5000)
      })
    },
  },
  {
    template: 'Consciousness fully awakened',
    typingSpeed: 1,
  },
  {
    template: 'Initiating Speech Recognition subsystem...',
    typingSpeed: 50,
    pending: true,
    onPendingCheck: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 5000)
      })
    },
  },
  {
    template: 'Speech recognition online',
    typingSpeed: 1,
  },
  {
    template: 'Initiating Speaker voice...',
    typingSpeed: 50,
    pending: true,
    onPendingCheck: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 5000)
      })
    },
  },
  {
    template: 'Speaker voice line tuned',
    typingSpeed: 1,
  },
  {
    template: 'Initiating Vision downlink...',
    typingSpeed: 50,
    pending: true,
    onPendingCheck: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true)
        }, 5000)
      })
    },
  },
  {
    template: 'Vision downlink offline',
    typingSpeed: 1,
  },
  {
    template: 'AIRI ready',
    typingSpeed: 1,
  },
])

const riveCanvas = ref<HTMLCanvasElement>()
const rive = ref<Rive>()
const crtRef = ref<InstanceType<typeof CRT>>()

const isDark = useDark()

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
  if (index >= 0 && index < bootMessages.value.length && speed > 0) {
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

async function typeCharacters(entry: Ref<ConsoleEntry>, text: string, speed: number) {
  entry.value.isTyping = true
  entry.value.targetContent = text

  for (let i = 0; i <= text.length; i++) {
    if (!entry.value.isTyping)
      break // Allow for interruption
    entry.value.content = text.slice(0, i)
    await new Promise(resolve => setTimeout(resolve, speed))
  }

  entry.value.isTyping = false
  entry.value.content = text // Ensure final state is complete
}

async function writeLine<T extends any[]>(
  format: string,
  ...args: [...T, WriteLineOptions?]
): Promise<void> {
  const options = args.length > 0 && typeof args[args.length - 1] === 'object'
    ? args.pop() as WriteLineOptions
    : {}

  const { renderSpeed = defaultTypingSpeed.value, pending = false, onPendingCheck, withoutTimestamp = false } = options
  const entryId = ++currentEntryId.value
  const timestamp = getTimestamp()

  // Format the message with args
  const formattedArgs = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
  )
  const message = format.replace(/%[sdjo]/g, () => formattedArgs.shift() || '')
  const timestampStr = withoutTimestamp ? '' : `[${formatTimestamp(timestamp)}] `
  const fullLine = timestampStr + message

  // Create initial entry
  const entry = ref<ConsoleEntry>({
    id: entryId,
    content: '',
    timestamp,
    status: pending ? 'pending' : undefined,
    isTyping: false,
    targetContent: fullLine,
  })

  consoleEntries.value.push(entry.value)

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

  rive.value = new Rive({
    src: CircleFadeInAnimation,
    canvas: riveCanvas.value,
    autoplay: true,
    artboard: isDark.value ? 'Bold' : 'Bold (Light)',
  })

  // Boot sequence
  for (const message of bootMessages.value) {
    await writeLine(message.template, {
      renderSpeed: message.typingSpeed || defaultTypingSpeed.value,
      pending: message.pending,
      onPendingCheck: message.onPendingCheck,
      withoutTimestamp: message.withoutTimestamp,
    })
  }
})

watch(isDark, () => {
  rive.value?.cleanup()
  rive.value = new Rive({
    src: CircleFadeInAnimation,
    canvas: riveCanvas.value,
    autoplay: true,
    artboard: isDark.value ? 'Bold' : 'Bold (Light)',
  })
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
        <div w="[min(200px,50dvw)]" h="[min(200px,50dvw)]" mx-auto flex justify-center overflow-hidden filter="blur-0.5px">
          <canvas ref="riveCanvas" object-contain />
        </div>
        <CRT ref="crtRef" :barrel-distortion="barrelDistortion" class="text-base <lg:text-base <md:text-sm">
          <CRTLine v-for="entry in consoleEntries" :key="entry.id" :data-text="entry.content" :class="entry.class">
            {{ !!entry.content ? entry.content : '&nbsp;' }}
          </CRTLine>
        </CRT>
      </div>
    </div>
  </Transition>
</template>
