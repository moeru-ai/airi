<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'
import { computed } from 'vue'

const props = defineProps<{
  toolName: string
  args: string
}>()

const formattedArgs = computed(() => {
  try {
    const parsed = JSON.parse(props.args)
    return JSON.stringify(parsed, null, 2).trim()
  }
  catch {
    return props.args
  }
})
</script>

<template>
  <Collapsible
    :class="[
      'bg-primary-100/40 dark:bg-primary-900/60 rounded-lg px-2 pb-2 pt-2',
      'flex flex-col gap-2 items-start',
    ]"
  >
    <template #trigger="{ visible, setVisible }">
      <button
        :class="[
          'w-full text-start',
        ]"
        @click="setVisible(!visible)"
      >
        <div i-solar:sledgehammer-bold-duotone class="mr-1 inline-block translate-y-1 op-50" />
        <code>{{ toolName }}</code>
      </button>
    </template>
    <div
      :class="[
        'rounded-md p-2 w-full',
        'bg-neutral-100/80 text-sm text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200',
      ]"
    >
      <div class="whitespace-pre-wrap break-words font-mono">
        {{ formattedArgs }}
      </div>
    </div>
  </Collapsible>
</template>
