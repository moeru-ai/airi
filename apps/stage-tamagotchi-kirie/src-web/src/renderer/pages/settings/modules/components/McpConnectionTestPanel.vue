<script setup lang="ts">
import type { ElectronMcpTestResult } from '../../../../../shared/eventa'

import { Alert, Button, FieldSelect, SettingsCard } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

interface TestOption {
  label: string
  value: string
}

const props = defineProps<{
  options: TestOption[]
  result?: ElectronMcpTestResult
  running: boolean
}>()

const emit = defineEmits<{
  test: []
}>()

const selectedRowId = defineModel<string>({ required: true })

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.mcp-server.${key}`, params ?? {})
</script>

<template>
  <SettingsCard>
    <div :class="['flex flex-col gap-1']">
      <h3 :class="['text-sm font-semibold']">
        {{ tn('test.title') }}
      </h3>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ tn('test.description') }}
      </p>
    </div>

    <div :class="['flex flex-wrap items-end gap-2']">
      <FieldSelect
        v-model="selectedRowId"
        layout="vertical"
        :class="['min-w-60 flex-1']"
        :label="tn('test.pick-server-label')"
        :options="props.options"
        :placeholder="tn('test.no-servers')"
        :disabled="!props.options.length"
      />
      <Button
        size="md"
        :loading="props.running"
        :disabled="props.running || !props.options.length"
        icon="i-solar:plug-circle-bold-duotone"
        :label="tn('actions.test')"
        @click="emit('test')"
      />
    </div>

    <Alert
      v-if="props.result"
      :tone="props.result.ok ? 'success' : 'danger'"
      live="polite"
      :title="props.result.ok
        ? tn('test.success', { count: props.result.tools?.length ?? 0, ms: props.result.durationMs })
        : tn('test.failure', { ms: props.result.durationMs })"
    >
      <template v-if="!props.result.ok && props.result.error" #default>
        <div :class="['break-all text-xs']">
          {{ props.result.error }}
        </div>
      </template>
      <template v-else-if="props.result.ok && props.result.tools?.length" #default>
        <div :class="['flex flex-wrap gap-1 text-xs']">
          <span v-for="name in props.result.tools" :key="name" :class="['rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono']">
            {{ name }}
          </span>
        </div>
      </template>
    </Alert>
  </SettingsCard>
</template>
