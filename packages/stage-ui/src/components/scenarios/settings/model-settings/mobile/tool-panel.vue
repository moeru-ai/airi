<script setup lang="ts" generic="T extends string">
import { AnimatedHeight } from '@proj-airi/ui'

/**
 * The panel above the tab bar. It shows the tools of the active tab and the content of the active tool.
 *
 * All tools share this one panel. When the tool or the tab changes, the panel animates to the new height,
 * and the new content fades in while the old content fades out. Each tool fills a slot with the same name as its id.
 */
defineProps<{
  /** Names the tool row for assistive technology. */
  label: string
  /** A tool with `changed` set shows a dot, because its value differs from the default. */
  tools: ReadonlyArray<{ id: T, label: string, icon: string, changed?: boolean }>
}>()

const activeTool = defineModel<T>({ required: true })
</script>

<template>
  <div :class="['mx-3 flex flex-col gap-3 rounded-2xl px-4 py-3', 'bg-neutral-50/70 backdrop-blur-md dark:bg-neutral-900/70']">
    <!-- Only the tool content changes height. The tool row below it stays in place. -->
    <!-- The clip area reaches 8px into the panel padding, so enlarged swatches and focus rings are not cut off. -->
    <AnimatedHeight align="end" :class="['-mx-2 -mt-2']">
      <!-- The old content leaves on top of the new content, so the measured height is always the new height. -->
      <div :class="['relative px-2 pt-2']">
        <Transition
          enter-active-class="transition-[opacity,filter] duration-200 ease-out"
          enter-from-class="opacity-0 blur-[4px]"
          leave-active-class="absolute inset-x-2 bottom-0 transition-[opacity,filter] duration-150 ease-in"
          leave-to-class="opacity-0 blur-[4px]"
        >
          <div :key="activeTool" :class="['flex flex-col gap-3']">
            <slot :name="activeTool" />
          </div>
        </Transition>
      </div>
    </AnimatedHeight>

    <div v-if="tools.length > 1" role="toolbar" :aria-label="label" :class="['flex justify-center gap-3']">
      <button
        v-for="tool in tools"
        :key="tool.id"
        type="button"
        :aria-label="tool.label"
        :aria-pressed="activeTool === tool.id"
        :class="[
          'relative size-11 shrink-0 rounded-full',
          'flex items-center justify-center',
          'transition-colors duration-200',
          'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
          activeTool === tool.id
            ? 'bg-primary-500/15 text-primary-700 dark:bg-primary-400/15 dark:text-primary-200'
            : 'text-neutral-600 hover:bg-primary-500/10 dark:text-neutral-300',
        ]"
        @click="activeTool = tool.id"
      >
        <span :class="[tool.icon, 'size-5.5']" />
        <span
          v-if="tool.changed"
          aria-hidden="true"
          :class="['absolute right-1 top-1 size-2 rounded-full', 'bg-primary-500 dark:bg-primary-400']"
        />
      </button>
    </div>
  </div>
</template>
