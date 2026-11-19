<script setup lang="ts">
import type { ServerForm } from '../mcp-config'

import { Button, FieldInput, FieldKeyValues, FieldSelect, GhostButton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineEmits<{ remove: [] }>()

const model = defineModel<ServerForm>({ required: true })

const { t } = useI18n()
const tn = (k: string) => t(`settings.pages.modules.mcp-server.${k}`)

const transportOptions = computed(() => [
  { label: tn('fields.transport.stdio'), value: 'stdio' as const },
  { label: tn('fields.transport.http'), value: 'http' as const },
])
</script>

<template>
  <div flex="~ col gap-4">
    <FieldInput
      v-model="model.identifier"
      :label="tn('fields.identifier.label')"
      :description="tn('fields.identifier.description')"
      :placeholder="tn('fields.identifier.placeholder')"
      required
    />
    <FieldSelect
      v-model="model.transport"
      :label="tn('fields.transport.label')"
      :description="tn('fields.transport.description')"
      :options="transportOptions"
    />

    <FieldInput
      v-if="model.transport === 'http'"
      v-model="model.url"
      :label="tn('fields.url.label')"
      :description="tn('fields.url.description')"
      :placeholder="tn('fields.url.placeholder')"
      input-class="font-mono"
      required
    />
    <template v-else>
      <FieldInput
        v-model="model.command"
        :label="tn('fields.command.label')"
        :description="tn('fields.command.description')"
        :placeholder="tn('fields.command.placeholder')"
        required
      />
      <FieldInput
        v-model="model.argsText"
        :single-line="false"
        :label="tn('fields.args.label')"
        :description="tn('fields.args.description')"
        :placeholder="tn('fields.args.placeholder')"
        input-class="font-mono"
      />
      <FieldInput
        v-model="model.cwd"
        :label="tn('fields.cwd.label')"
        :description="tn('fields.cwd.description')"
        :placeholder="tn('fields.cwd.placeholder')"
        input-class="font-mono"
        :required="false"
      />
    </template>

    <div flex="~ col gap-2">
      <FieldKeyValues
        v-if="model.transport === 'http'"
        v-model="model.headerEntries"
        :label="tn('fields.headers.label')"
        :description="tn('fields.headers.description')"
        :key-placeholder="tn('fields.headers.key-placeholder')"
        :value-placeholder="tn('fields.headers.value-placeholder')"
        :required="false"
        @remove="(i) => model.headerEntries.splice(i, 1)"
      />
      <FieldKeyValues
        v-else
        v-model="model.envEntries"
        :label="tn('fields.env.label')"
        :description="tn('fields.env.description')"
        :key-placeholder="tn('fields.env.key-placeholder')"
        :value-placeholder="tn('fields.env.value-placeholder')"
        :required="false"
        @remove="(i) => model.envEntries.splice(i, 1)"
      />
      <div class="flex justify-end">
        <GhostButton
          v-if="model.transport === 'http'"
          size="sm"
          icon="i-solar:add-circle-bold-duotone" :label="tn('actions.add-header')"
          @click="model.headerEntries.push({ key: '', value: '' })"
        />
        <GhostButton
          v-else
          size="sm"
          icon="i-solar:add-circle-bold-duotone" :label="tn('actions.add-env')"
          @click="model.envEntries.push({ key: '', value: '' })"
        />
      </div>
    </div>

    <div class="flex justify-end border-t border-neutral-200/70 pt-2 dark:border-neutral-800">
      <Button
        size="sm"
        icon="i-solar:trash-bin-2-bold-duotone" :label="tn('actions.remove')"
        color="red"
        variant="primary" @click="$emit('remove')"
      />
    </div>
  </div>
</template>
