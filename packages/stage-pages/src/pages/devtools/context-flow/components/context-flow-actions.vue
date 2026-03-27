<script setup lang="ts">
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { Section } from '@proj-airi/stage-ui/components'
import { Button, FieldInput, FieldTextArea, SelectTab } from '@proj-airi/ui'

const emit = defineEmits<{
  (event: 'sendContextUpdate'): void
  (event: 'sendSparkNotify'): void
}>()
const testStrategy = defineModel<ContextUpdateStrategy>('testStrategy', { required: true })
const testPayload = defineModel<string>('testPayload', { required: true })
const testSparkNotifyPayload = defineModel<string>('testSparkNotifyPayload', { required: true })
const attentionTickInterval = defineModel<number>('attentionTickInterval', { required: true })
const attentionTaskWindow = defineModel<number>('attentionTaskWindow', { required: true })
const attentionRequeueDelay = defineModel<number>('attentionRequeueDelay', { required: true })
const attentionMaxAttempts = defineModel<number>('attentionMaxAttempts', { required: true })

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
    <Section title="Attention" icon="i-solar:settings-bold-duotone" inner-class="gap-3" :expand="false">
      <div :class="['grid', 'gap-3', 'sm:grid-cols-2']">
        <FieldInput
          v-model.number="attentionTickInterval"
          label="Tick interval (ms)"
          description="How often the attention loop wakes up."
          type="number"
        />
        <FieldInput
          v-model.number="attentionTaskWindow"
          label="Task notify window (ms)"
          description="How far ahead tasks should be reminded."
          type="number"
        />
        <FieldInput
          v-model.number="attentionRequeueDelay"
          label="Requeue delay (ms)"
          description="Delay added when retries are scheduled."
          type="number"
        />
        <FieldInput
          v-model.number="attentionMaxAttempts"
          label="Max attempts"
          description="How many times to retry a spark:notify."
          type="number"
        />
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
