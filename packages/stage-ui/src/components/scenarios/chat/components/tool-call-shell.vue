<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'

/** Properties for the shared collapsible frame around a chat tool call. */
interface Props {
  toolName: string
  state?: 'executing' | 'done' | 'error'
}

defineProps<Props>()

defineSlots<{
  actions: (props: Record<string, never>) => unknown
  default: (props: Record<string, never>) => unknown
  labelSuffix: (props: Record<string, never>) => unknown
}>()
</script>

<template>
  <Collapsible
    :class="[
      'rounded-lg bg-primary-100/40 px-1 pb-1 pt-1 dark:bg-primary-900/60',
      'flex flex-col items-start',
    ]"
  >
    <template #trigger="{ visible, setVisible }">
      <div
        :class="[
          'min-h-6 w-full',
          'inline-flex items-center gap-1',
        ]"
      >
        <button
          :class="[
            'min-w-0 flex-1 text-start',
            'inline-flex items-center',
          ]"
          @click="setVisible(!visible)"
        >
          <div
            v-if="state === 'executing'"
            class="i-eos-icons:loading mr-1 inline-block op-50"
          />
          <div
            v-else-if="state === 'error'"
            class="i-solar:danger-circle-bold-duotone mr-1 inline-block text-red-500"
          />
          <div
            v-else-if="state === 'done'"
            class="i-solar:check-circle-bold-duotone mr-1 inline-block text-emerald-500"
          />
          <div
            v-else
            class="i-solar:sledgehammer-bold-duotone mr-1 inline-block translate-y-1 op-50"
          />
          <code class="truncate text-xs">{{ toolName }}</code>
          <slot name="labelSuffix" />
        </button>
        <slot name="actions" />
      </div>
    </template>

    <div
      :class="[
        'mt-2 w-full rounded-md p-2',
        'bg-neutral-100/80 text-sm text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200',
      ]"
    >
      <slot />
    </div>
  </Collapsible>
</template>
