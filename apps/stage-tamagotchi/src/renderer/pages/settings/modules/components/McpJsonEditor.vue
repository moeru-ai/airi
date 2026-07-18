<script setup lang="ts">
import { Button, Callout } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  error: string
}>()

const emit = defineEmits<{
  apply: []
  close: []
  format: []
  openConfig: []
  resetDraft: []
}>()

const draft = defineModel<string>({ required: true })

const { t } = useI18n()
const tn = (key: string) => t(`settings.pages.modules.mcp-server.${key}`)

const JSON_TEXTAREA = 'w-full rounded-lg border-2 border-solid border-primary-100 bg-white px-3 py-2 text-sm font-mono leading-relaxed shadow-sm outline-none transition-all duration-200 ease-in-out focus:border-primary-300 focus:bg-white dark:border-primary-900/60 dark:bg-neutral-950 dark:focus:border-primary-400/50 dark:focus:bg-neutral-900'
</script>

<template>
  <section class="flex flex-col gap-3 border-2 border-primary-200 rounded-xl border-solid bg-primary-50/40 p-4 dark:border-primary-900/60 dark:bg-primary-900/10 md:p-5">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('json.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('json.description') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon="i-solar:folder-open-bold-duotone" :label="tn('actions.open-config')" @click="emit('openConfig')" />
        <Button variant="ghost" size="sm" icon="i-solar:restart-line-duotone" :label="tn('actions.reset-draft')" @click="emit('resetDraft')" />
        <Button variant="ghost" size="sm" icon="i-solar:magic-stick-3-bold-duotone" :label="tn('actions.format-json')" @click="emit('format')" />
      </div>
    </div>

    <textarea
      v-model="draft"
      rows="18"
      spellcheck="false"
      :placeholder="tn('json.placeholder')"
      :class="JSON_TEXTAREA"
    />

    <Callout v-if="props.error" theme="orange" :label="tn('error-title')">
      {{ props.error }}
    </Callout>

    <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
      <Button variant="secondary" size="sm" :label="tn('actions.cancel')" @click="emit('close')" />
      <Button variant="primary" size="sm" icon="i-solar:check-circle-bold-duotone" :label="tn('actions.apply-json')" @click="emit('apply')" />
    </div>
  </section>
</template>
