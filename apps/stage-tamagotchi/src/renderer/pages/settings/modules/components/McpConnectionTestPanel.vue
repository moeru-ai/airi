<script setup lang="ts">
import type { ElectronMcpStdioTestResult } from '../../../../../shared/eventa'

import { Button, Callout, FieldSelect } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

interface TestOption {
  label: string
  value: string
}

const props = defineProps<{
  options: TestOption[]
  result?: ElectronMcpStdioTestResult
  running: boolean
}>()

const emit = defineEmits<{
  test: []
}>()

const selectedRowId = defineModel<string>({ required: true })

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.mcp-server.${key}`, params ?? {})

const PANEL = 'flex flex-col gap-3 rounded-xl border-2 border-solid border-neutral-100 bg-white p-4 md:p-5 dark:border-neutral-900 dark:bg-neutral-900/30'
</script>

<template>
  <section :class="PANEL">
    <div flex="~ col gap-1">
      <h3 class="text-sm font-semibold">
        {{ tn('test.title') }}
      </h3>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ tn('test.description') }}
      </p>
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <FieldSelect
        v-model="selectedRowId"
        layout="vertical"
        class="min-w-60 flex-1"
        :label="tn('test.pick-server-label')"
        :options="props.options"
        :placeholder="tn('test.no-servers')"
        :disabled="!props.options.length"
      />
      <Button
        variant="secondary"
        size="md"
        :loading="props.running"
        :disabled="props.running || !props.options.length"
        icon="i-solar:plug-circle-bold-duotone"
        :label="tn('actions.test')"
        @click="emit('test')"
      />
    </div>

    <Callout
      v-if="props.result"
      :theme="props.result.ok ? 'lime' : 'orange'"
      :label="props.result.ok
        ? tn('test.success', { count: props.result.tools?.length ?? 0, ms: props.result.durationMs })
        : tn('test.failure', { ms: props.result.durationMs })"
    >
      <div v-if="!props.result.ok && props.result.error" class="break-all text-xs">
        {{ props.result.error }}
      </div>
      <div v-if="props.result.ok && props.result.tools?.length" class="flex flex-wrap gap-1 text-xs">
        <span v-for="name in props.result.tools" :key="name" class="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono">
          {{ name }}
        </span>
      </div>
    </Callout>
  </section>
</template>
