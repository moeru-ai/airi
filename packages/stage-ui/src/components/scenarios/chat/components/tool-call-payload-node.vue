<script setup lang="ts">
import type { PayloadNode } from './tool-call-group'

import ToolCallPayloadNode from './tool-call-payload-node.vue'

/** One level of a tool payload. Objects list their fields, and nested values indent under their key. */
const props = defineProps<{
  node: PayloadNode
}>()

const INDEX_CLASSES = ['text-[10px] font-semibold tabular-nums', 'text-primary-500 dark:text-primary-300']
const VALUE_CLASSES = ['min-w-0 whitespace-pre-wrap break-words text-xs', 'text-neutral-800 dark:text-neutral-100']
// A hairline guide, like the indent guides of a code editor, shows the level of a nested value.
// It stays neutral, so deep nesting does not stack bold lines next to the content.
const NESTED_CLASSES = [
  'relative min-w-0 pl-3',
  `before:absolute before:left-0.5 before:top-0.5 before:bottom-0.5 before:w-px before:content-['']`,
  'before:bg-neutral-300 dark:before:bg-neutral-700',
]
</script>

<template>
  <span v-if="props.node.kind === 'text'" :class="VALUE_CLASSES">{{ props.node.text }}</span>

  <span v-else-if="props.node.kind === 'object' && !props.node.entries.length" :class="VALUE_CLASSES">{}</span>
  <div v-else-if="props.node.kind === 'object'" :class="['grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1']">
    <template v-for="entry in props.node.entries" :key="entry.key">
      <template v-if="entry.value.kind === 'text'">
        <span :class="['break-all text-[10px]', 'text-neutral-500 dark:text-neutral-400']">{{ entry.key }}</span>
        <span :class="VALUE_CLASSES">{{ entry.value.text }}</span>
      </template>
      <template v-else>
        <span :class="['col-span-2 break-all text-[10px]', 'text-neutral-500 dark:text-neutral-400']">{{ entry.key }}</span>
        <div :class="['col-span-2', NESTED_CLASSES]">
          <ToolCallPayloadNode :node="entry.value" />
        </div>
      </template>
    </template>
  </div>

  <span v-else-if="!props.node.items.length" :class="VALUE_CLASSES">[]</span>
  <div v-else :class="['flex flex-col gap-2']">
    <!-- Each item carries its number, so a list reads as a list. An object item takes it as a label, like a Callout. -->
    <template v-for="(item, index) in props.node.items" :key="index">
      <div v-if="item.kind === 'text'" :class="['grid grid-cols-[1.25rem_minmax(0,1fr)] items-baseline gap-x-1.5']">
        <span :class="INDEX_CLASSES">{{ index + 1 }}</span>
        <ToolCallPayloadNode :node="item" />
      </div>
      <div v-else :class="['flex flex-col gap-1']">
        <span :class="INDEX_CLASSES">{{ index + 1 }}</span>
        <ToolCallPayloadNode :node="item" />
      </div>
    </template>
  </div>
</template>
