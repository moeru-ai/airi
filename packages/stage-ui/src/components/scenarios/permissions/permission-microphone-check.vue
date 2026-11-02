<script setup lang="ts">
import { observeLevel } from '@proj-airi/pipelines-audio'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { useSettingsAudioDevice } from '../../../stores/settings/audio-device'

const props = defineProps<{
  /** True while the microphone is allowed. The check opens the microphone only then. */
  active: boolean
}>()

/** True after the microphone heard speech. It stays true, so a pause after speech does not hide the result. */
const heard = defineModel<boolean>('heard', { default: false })
/** True after a few seconds without speech, so the page can suggest a check of mute or the input. */
const quiet = defineModel<boolean>('quiet', { default: false })

/** A level above this value counts as speech. The levels map -60 dBFS to 0 and full scale to 1, so this is about -27 dBFS. */
const SPEECH_LEVEL = 0.55
/** Speech must last this many 50 ms windows in total. A single click or bump does not count. */
const SPEECH_WINDOWS = 6
/** Windows without speech before the page suggests a check, about 3 seconds. */
const QUIET_WINDOWS = 60

const audioDevice = useSettingsAudioDevice()
/** The smoothed level that the ring shows, from 0 to 1. */
const level = shallowRef(0)
let meter: AbortController | undefined

function stop() {
  meter?.abort('Microphone check stopped')
  meter = undefined
  level.value = 0
}

function start() {
  stop()
  const controller = new AbortController()
  meter = controller
  let speechWindows = 0
  let windows = 0
  observeLevel(audioDevice.input, controller.signal, (next) => {
    // The ring rises fast and falls slowly, so it follows speech without flicker.
    const rate = next > level.value ? 0.55 : 0.12
    level.value += (next - level.value) * rate
    windows += 1
    if (next > SPEECH_LEVEL)
      speechWindows += 1
    if (!heard.value && speechWindows >= SPEECH_WINDOWS)
      heard.value = true
    quiet.value = !heard.value && windows > QUIET_WINDOWS && speechWindows === 0
  })
}

watch([() => props.active, () => audioDevice.input], ([active]) => {
  if (active && !heard.value)
    start()
  else
    stop()
}, { immediate: true })
watch(heard, (value) => {
  if (!value)
    return
  quiet.value = false
  stop()
})
onScopeDispose(stop)

const ringScale = computed(() => 1 + level.value * 0.55)
const haloScale = computed(() => 1.15 + level.value * 0.95)
// Room noise in a quiet room reads about 0.3, so the ring lights up only above it.
const speaking = computed(() => level.value > 0.4)
</script>

<template>
  <div
    :class="['relative size-50 flex items-center justify-center']"
    role="img"
    :aria-label="heard ? 'Microphone heard you' : 'Microphone input level'"
  >
    <div
      :class="['absolute size-24 rounded-full bg-neutral-900/4 dark:bg-white/5']"
      :style="{ transform: `scale(${haloScale})` }"
    />
    <div
      :class="[
        'absolute size-24 rounded-full border-2 border-solid transition-colors duration-200',
        speaking ? 'border-neutral-800 dark:border-neutral-200' : 'border-neutral-200 dark:border-neutral-700',
      ]"
      :style="{ transform: `scale(${ringScale})` }"
    />
    <div
      :class="[
        'relative size-22 flex items-center justify-center rounded-full transition-colors duration-200',
        heard ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
      ]"
    >
      <div :class="[heard ? 'i-mingcute:check-line' : 'i-mingcute:mic-line', 'size-10']" />
    </div>
  </div>
</template>
