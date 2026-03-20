<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import {
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

defineProps<{
  sensorPayload?: string
  staticSamplePayload: string
}>()
const heartbeatsEnabled = defineModel<boolean>('heartbeatsEnabled', { required: true })
const heartbeatsIntervalMinutes = defineModel<number>('heartbeatsIntervalMinutes', { required: true })
const heartbeatsPrompt = defineModel<string>('heartbeatsPrompt', { required: true })
const heartbeatsInjectIntoPrompt = defineModel<boolean>('heartbeatsInjectIntoPrompt', { required: true })
const heartbeatsUseAsLocalGate = defineModel<boolean>('heartbeatsUseAsLocalGate', { required: true })
const heartbeatsScheduleStart = defineModel<string>('heartbeatsScheduleStart', { required: true })
const heartbeatsScheduleEnd = defineModel<string>('heartbeatsScheduleEnd', { required: true })
const heartbeatsContextWindowHistory = defineModel<boolean>('heartbeatsContextWindowHistory', { required: true })
const heartbeatsContextSystemLoad = defineModel<boolean>('heartbeatsContextSystemLoad', { required: true })
const heartbeatsContextUsageMetrics = defineModel<boolean>('heartbeatsContextUsageMetrics', { required: true })
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3 text-sm text-neutral-500">
      Configure how often AIRI will proactively speak to you without being prompted.
    </p>
    <div class="input-list ml-auto mr-auto w-90% flex flex-col flex-wrap justify-center gap-6">
      <div class="flex items-center gap-2">
        <input id="heartbeats-enabled" v-model="heartbeatsEnabled" type="checkbox" class="h-4 w-4 border-gray-300 rounded text-primary-600">
        <label for="heartbeats-enabled" class="font-medium">Enable Proactive Heartbeats</label>
      </div>

      <div v-if="heartbeatsEnabled" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-300">Interval (Minutes)</label>
          <input v-model="heartbeatsIntervalMinutes" type="number" min="1" max="1440" class="border border-neutral-200 rounded-lg bg-transparent px-3 py-2 dark:border-neutral-700">
          <span class="text-xs text-neutral-500">How often to tick the heartbeat polling.</span>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-neutral-700 font-medium dark:text-neutral-300">Schedule Options</label>
          <div class="flex items-center gap-2">
            <input v-model="heartbeatsScheduleStart" type="time" class="flex-1 border border-neutral-200 rounded-lg bg-transparent px-2 py-1 dark:border-neutral-700">
            <span>to</span>
            <input v-model="heartbeatsScheduleEnd" type="time" class="flex-1 border border-neutral-200 rounded-lg bg-transparent px-2 py-1 dark:border-neutral-700">
          </div>
          <span class="mt-1 text-xs text-neutral-500">Only trigger heartbeats between these hours.</span>
        </div>

        <div class="col-span-1 mt-4 flex flex-col gap-4 sm:col-span-2">
          <div class="flex flex-col gap-2 border-l-2 border-neutral-100 pl-4 dark:border-neutral-700">
            <div class="flex items-center gap-2">
              <input id="heartbeats-injectContext" v-model="heartbeatsInjectIntoPrompt" type="checkbox" class="h-4 w-4">
              <label for="heartbeats-injectContext" class="group relative flex items-center gap-1 text-sm font-semibold dark:text-neutral-200">
                Inject Rich Context into heartbeats
                <TooltipProvider :delay-duration="0">
                  <TooltipRoot>
                    <TooltipTrigger as-child>
                      <div i-lucide:info class="h-4 w-4 cursor-help text-neutral-400" />
                    </TooltipTrigger>
                    <TooltipContent
                      class="z-110 max-w-sm animate-fadeIn animate-duration-200 rounded-lg bg-neutral-900 p-3 text-xs text-white shadow-xl"
                      :side-offset="8"
                      side="right"
                    >
                      <p class="mb-2 border-b border-white/20 pb-1 text-primary-400 font-bold">Sample Prompt Payload:</p>
                      <pre class="max-h-60 overflow-y-auto whitespace-pre-wrap font-mono opacity-90">{{ sensorPayload || staticSamplePayload }}</pre>
                      <TooltipArrow class="fill-neutral-900" />
                    </TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
              </label>
            </div>
            <span class="text-xs text-neutral-500">Inject real-time sensor and usage data into the proactivity prompt.</span>

            <div v-if="heartbeatsInjectIntoPrompt" class="grid grid-cols-1 ml-6 mt-2 gap-2 sm:grid-cols-3">
              <div class="flex items-center gap-2">
                <input id="ctx-window" v-model="heartbeatsContextWindowHistory" type="checkbox" class="h-3.5 w-3.5">
                <label for="ctx-window" class="text-xs text-neutral-600 dark:text-neutral-400">Window History</label>
              </div>
              <div class="flex items-center gap-2">
                <input id="ctx-load" v-model="heartbeatsContextSystemLoad" type="checkbox" class="h-3.5 w-3.5">
                <label for="ctx-load" class="text-xs text-neutral-600 dark:text-neutral-400">System Load</label>
              </div>
              <div class="flex items-center gap-2">
                <input id="ctx-metrics" v-model="heartbeatsContextUsageMetrics" type="checkbox" class="h-3.5 w-3.5">
                <label for="ctx-metrics" class="text-xs text-neutral-600 dark:text-neutral-400">Usage Metrics</label>
              </div>
            </div>
          </div>

          <div class="mt-2 flex items-center gap-2">
            <input id="heartbeats-localGate" v-model="heartbeatsUseAsLocalGate" type="checkbox" class="h-4 w-4">
            <label for="heartbeats-localGate" class="text-sm text-neutral-700 font-medium dark:text-neutral-300">Require Keyboard/Mouse Inactivity</label>
          </div>
          <span class="pl-6 text-xs text-neutral-500">Only trigger the LLM if the user is currently idle (mouse/keyboard).</span>
        </div>

        <div class="col-span-1 mt-4 sm:col-span-2">
          <FieldInput v-model="heartbeatsPrompt" label="Stealth Heartbeat Prompt" description="The hidden instruction sent to the LLM during a heartbeat tick. Instruct it to reply with exactly &quot;NO_REPLY&quot; if you want it to remain silent." :single-line="false" placeholder="You are evaluating a proactive heartbeat. Provide a fun comment, or output NO_REPLY to remain silent." />
        </div>
      </div>
    </div>
  </div>
</template>
