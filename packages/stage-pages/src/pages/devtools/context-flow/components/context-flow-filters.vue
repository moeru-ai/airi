<script setup lang="ts">
import type { FlowDirection } from '../context-flow-types'

import { Button, FieldCheckbox, FieldInput, SelectTab } from '@proj-airi/ui'

const emit = defineEmits<{ (event: 'clear'): void }>()
const directionFilter = defineModel<'all' | FlowDirection>('directionFilter', { required: true })
const showIncoming = defineModel<boolean>('showIncoming', { required: true })
const showOutgoing = defineModel<boolean>('showOutgoing', { required: true })
const showServer = defineModel<boolean>('showServer', { required: true })
const showBroadcast = defineModel<boolean>('showBroadcast', { required: true })
const showChat = defineModel<boolean>('showChat', { required: true })
const showDevtools = defineModel<boolean>('showDevtools', { required: true })
const maxEntries = defineModel<string>('maxEntries', { required: true })

const directionOptions = [
  { label: 'All', value: 'all' },
  { label: 'Incoming', value: 'incoming' },
  { label: 'Outgoing', value: 'outgoing' },
]
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-6', 'rounded-xl', 'bg-neutral-50', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]', 'h-fit']">
    <div :class="['flex', 'items-center', 'gap-2', 'text-sm', 'font-semibold', 'text-neutral-600', 'dark:text-neutral-300']">
      <div :class="['size-5', 'i-solar:filter-bold-duotone']" />
      Filters
    </div>
    <div :class="['flex', 'flex-col', 'gap-3']">
      <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
        <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
          Direction
        </div>
        <SelectTab
          v-model="directionFilter"
          size="sm"
          :options="directionOptions"
        />
      </div>
      <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
        <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
          Visibility
        </div>
        <div :class="['flex', 'flex-wrap', 'gap-2']">
          <FieldCheckbox v-model="showIncoming" label="Show incoming" />
          <FieldCheckbox v-model="showOutgoing" label="Show outgoing" />
        </div>
      </div>
      <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
        <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
          Channels
        </div>
        <div :class="['flex', 'flex-wrap', 'gap-2']">
          <FieldCheckbox v-model="showServer" label="Server" />
          <FieldCheckbox v-model="showBroadcast" label="Broadcast" />
          <FieldCheckbox v-model="showChat" label="Chat" />
          <FieldCheckbox v-model="showDevtools" label="Devtools" />
        </div>
      </div>
      <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
        <FieldInput
          v-model="maxEntries"
          label="Max entries"
          description="50-1000 (default 200)"
          type="number"
        />
      </div>
      <div :class="['flex', 'items-end', 'justify-end', 'w-full']">
        <Button label="Clear" icon="i-solar:trash-bin-trash-bold-duotone" size="sm" @click="emit('clear')" />
      </div>
    </div>
  </div>
</template>
