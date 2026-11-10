<script setup lang="ts">
import type { ComputerUseViewOf } from './view'

import { ChatToolCallScrollArea } from '@proj-airi/stage-ui/components'

/** AUV help: the intro, then each section as a list of commands or options, and as text for examples and usage lines. */
const props = defineProps<{
  view: ComputerUseViewOf<'help'>
}>()
</script>

<template>
  <ChatToolCallScrollArea>
    <div v-if="props.view.help" :class="['flex flex-col gap-2.5']">
      <p v-for="(paragraph, index) in props.view.help.intro" :key="`intro-${index}`" :class="['m-0 text-xs', 'text-neutral-700 dark:text-neutral-300']">
        {{ paragraph }}
      </p>
      <div v-for="section in props.view.help.sections" :key="section.title" :class="['flex flex-col gap-1']">
        <span :class="['text-[11px] font-semibold', 'text-neutral-500 dark:text-neutral-400']">{{ section.title }}</span>
        <div v-if="section.items.length > 0" :class="['flex flex-col gap-0.5']">
          <div
            v-for="item in section.items"
            :key="item.name"
            :class="['grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-2.5 rounded-lg px-2 py-1 text-[11px]', 'bg-white dark:bg-neutral-900/60']"
          >
            <code :class="['break-all', 'text-primary-600 dark:text-primary-300']">{{ item.name }}</code>
            <span :class="['whitespace-pre-line break-words', 'text-neutral-600 dark:text-neutral-300']">{{ item.description }}</span>
          </div>
        </div>
        <pre v-if="section.text" :class="['m-0 whitespace-pre-wrap rounded-lg px-2 py-1.5 font-mono text-[11px]', 'bg-white text-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200']">{{ section.text }}</pre>
      </div>
    </div>
    <!-- Help without sections shows as it is. -->
    <pre v-else :class="['m-0 whitespace-pre-wrap rounded-lg px-2.5 py-2 font-mono text-[11px]', 'bg-white text-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-200']">{{ props.view.text }}</pre>
  </ChatToolCallScrollArea>
</template>
