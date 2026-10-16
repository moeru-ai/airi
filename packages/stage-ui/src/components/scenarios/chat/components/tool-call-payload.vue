<script setup lang="ts">
import { computed } from 'vue'

import ToolCallPayloadNode from './tool-call-payload-node.vue'

import { formatToolPayload } from './tool-call-group'

/** Tool arguments or a tool result, shown as fields and values the same way for every tool. */
const props = defineProps<{
  label: string
  payload: unknown
}>()

const node = computed(() => formatToolPayload(props.payload))
</script>

<template>
  <div v-if="node" :class="['flex flex-col gap-1']">
    <span :class="['text-[10px]', 'text-neutral-500 dark:text-neutral-400']">{{ props.label }}</span>
    <!-- The neutral panel of the group frames the details, so a payload has no box of its own. A long one scrolls inside a fixed height. -->
    <div :class="['flex flex-col max-h-72 overflow-auto']">
      <ToolCallPayloadNode :node="node" />
    </div>
  </div>
</template>
