<script setup lang="ts">
import type { ServerForm } from '../mcp-config'

import { Button, FieldInput, FieldKeyValues, GhostButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineEmits<{ remove: [] }>()

const model = defineModel<ServerForm>({ required: true })

const { t } = useI18n()
const tn = (k: string) => t(`settings.pages.modules.mcp-server.${k}`)
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
    <div flex="~ col gap-2">
      <FieldKeyValues
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
