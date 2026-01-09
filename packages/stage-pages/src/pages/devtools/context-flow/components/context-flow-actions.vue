<script setup lang="ts">
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { Section } from '@proj-airi/stage-ui/components'
import { Button, FieldTextArea, SelectTab } from '@proj-airi/ui'

const emit = defineEmits<{
  (event: 'sendContextUpdate'): void
  (event: 'sendSparkNotify'): void
}>()
const testStrategy = defineModel<ContextUpdateStrategy>('testStrategy', { required: true })
const testPayload = defineModel<string>('testPayload', { required: true })
const testSparkNotifyPayload = defineModel<string>('testSparkNotifyPayload', { required: true })

const strategyOptions = [
  { label: 'Replace', value: ContextUpdateStrategy.ReplaceSelf },
  { label: 'Append', value: ContextUpdateStrategy.AppendSelf },
]
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-2']">
    <Section title="Send" icon="i-solar:plain-2-bold-duotone" inner-class="gap-3" :expand="false">
      <div :class="['flex', 'flex-col', 'gap-2']">
        <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
          Strategy
        </div>
        <SelectTab
          v-model="testStrategy"
          size="sm"
          :options="strategyOptions"
        />
        <FieldTextArea
          v-model="testPayload"
          label="Payload"
          description="Raw text payload sent as ContextUpdate.text. JSON is allowed."
          :input-class="['font-mono', 'min-h-32']"
        />
        <div :class="['flex', 'justify-end']">
          <Button label="Send context update" icon="i-solar:plain-2-bold-duotone" size="sm" @click="emit('sendContextUpdate')" />
        </div>
      </div>
    </Section>
    <Section title="Simulate incoming" icon="i-solar:plain-2-bold-duotone" inner-class="gap-3" :expand="false">
      <FieldTextArea
        v-model="testSparkNotifyPayload"
        label="spark:notify"
        description="Raw JSON payload for spark:notify. Required: headline, destinations[]. id/eventId will be auto-filled if missing."
        :input-class="['font-mono', 'min-h-44', 'overflow-hidden']"
      />
      <div :class="['flex', 'justify-end']">
        <Button
          label="Send spark:notify"
          icon="i-solar:bell-bing-bold-duotone"
          size="sm"
          @click="emit('sendSparkNotify')"
        />
      </div>
    </Section>
  </div>
</template>
