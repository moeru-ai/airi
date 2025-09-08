<script setup lang="ts">
import { RadioCardSimple } from '@proj-airi/stage-ui/components'
import { useBeatSyncStore } from '@proj-airi/stage-ui/stores/beat-sync'
import { createTimeline } from 'animejs'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const beatSyncStore = useBeatSyncStore()

const selectedAudioSource = ref<string>('none')

const audioSources = ref<Array<{
  id: string
  name: string
  value: string
  title: string
  description?: string
}>>([{
  id: 'none',
  name: 'none',
  value: 'none',
  title: 'None',
  description: 'Turn off this feature',
}, {
  id: 'screen-capture',
  name: 'screen',
  value: 'screen',
  title: 'Screen Capture',
  description: '',
}])

const beatsHistory = ref<Array<{
  level: number
  linearLevel: number
  timestamp: number
}>>([])

function linearLevel(level: number) {
  const base = 2
  const a = 0.5
  return ((base ** level - 1) / (base - 1)) ** a
}

watch(selectedAudioSource, async (source) => {
  switch (source) {
    case 'none':
      break
    case 'screen-capture': {
      await beatSyncStore.startFromScreenCapture()
      break
    }
  }
})

onMounted(() => {
  const onBeat = (level: number, timestamp: number) => {
    beatsHistory.value.unshift({
      level,
      linearLevel: linearLevel(level),
      timestamp,
    })

    // if (beatsHistory.value.length > 20)
    //   beatsHistory.value.splice(20)
  }

  beatSyncStore.on('beat', onBeat)

  onUnmounted(() => {
    beatSyncStore.off('beat', onBeat)
  })
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[40%]">
      <div flex="~ col gap-4">
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              Audio Source
            </h2>
            <div text="neutral-400 dark:neutral-400">
              <span>Select an audio source to detect beats from.</span>
            </div>
          </div>
          <div max-w-full>
            <!--
              fieldset has min-width set to --webkit-min-container, in order to use over flow scroll,
              we need to set the min-width to 0.
              See also: https://stackoverflow.com/a/33737340
            -->
            <fieldset
              flex="~ row gap-4"
              :style="{ 'scrollbar-width': 'none' }"
              min-w-0 of-x-scroll scroll-smooth
              role="radiogroup"
            >
              <RadioCardSimple
                v-for="source in audioSources"
                :id="source.id"
                :key="source.id"
                v-model="selectedAudioSource"
                name="provider"
                :value="source.id"
                :title="source.title || 'Unknown'"
                :description="source.description"
              />
            </fieldset>
          </div>
        </div>
      </div>
    </div>

    <div flex="~ col gap-6" class="w-full md:w-[60%]">
      <div w-full rounded-xl>
        <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
          <div class="inline-flex items-center gap-4">
            <div>
              Beats
            </div>
          </div>
        </h2>

        <div flex="~ col gap-4">
          <TransitionGroup
            tag="div"
            flex="~ row gap-2 wrap items-center"
            :css="false"
            @enter="(el) => {
              createTimeline()
                .set(el, {
                  opacity: 0,
                  scale: 1.1,
                })
                .add(el, {
                  opacity: 1,
                  scale: 1,
                  duration: 300,
                  ease: 'out(4)',
                })
                .add(el, {
                  opacity: 0,
                  duration: 5000,
                  delay: 300,
                  ease: 'in',
                  onComplete: () => {
                    beatsHistory.pop()
                  },
                })
            }"
          >
            <div v-for="beat in beatsHistory" :key="beat.timestamp">
              <div h-72px w-16px flex origin-bc items-center justify-center>
                <div
                  w-16px rounded bg-primary
                  :style="{
                    // width: `${16 + 32 * beat.linearLevel}px`,
                    height: `${16 + 56 * beat.linearLevel}px`,
                  }"
                />
              </div>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
