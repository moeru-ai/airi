<script setup lang="ts">
import { Button, Callout, FieldTextArea } from '@proj-airi/ui'

defineProps<{
  error: string | null
  disabled: boolean
  busy: 'preview' | 'apply' | 'advanced-preview' | 'advanced-apply' | null
}>()

const emit = defineEmits<{
  exportForm: []
  importForm: []
  preview: []
  apply: []
}>()

const json = defineModel<string>({ required: true })
</script>

<template>
  <section :class="['panel', 'overflow-hidden']">
    <div :class="['flex', 'items-start', 'justify-between', 'gap-3', 'border-b', 'border-neutral-200', 'px-4', 'py-3']">
      <div>
        <h3 :class="['text-sm', 'font-semibold']">
          Advanced JSON
        </h3>
        <p :class="['mt-1', 'text-xs', 'text-neutral-500']">
          Escape hatch for auditing or unsupported future fields.
        </p>
      </div>
      <span :class="['i-lucide-code-2', 'text-neutral-500']" />
    </div>

    <div :class="['space-y-4', 'p-4']">
      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <Button icon="i-lucide-file-output" label="Export Form" size="sm" type="button" variant="secondary" @click="emit('exportForm')" />
        <Button icon="i-lucide-file-input" label="Import JSON" size="sm" type="button" variant="secondary" @click="emit('importForm')" />
      </div>

      <FieldTextArea
        v-model="json"
        :required="false"
        :rows="12"
        textarea-class="font-mono text-xs leading-5"
      />

      <Callout v-if="error" label="Advanced JSON error" theme="orange">
        {{ error }}
      </Callout>

      <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
        <Button
          icon="i-lucide-eye"
          label="Preview JSON"
          size="sm"
          type="button"
          variant="secondary"
          :disabled="disabled || error != null"
          :loading="busy === 'advanced-preview'"
          @click="emit('preview')"
        />
        <Button
          icon="i-lucide-save"
          label="Apply JSON"
          size="sm"
          type="button"
          :disabled="disabled || error != null"
          :loading="busy === 'advanced-apply'"
          @click="emit('apply')"
        />
      </div>
    </div>
  </section>
</template>
