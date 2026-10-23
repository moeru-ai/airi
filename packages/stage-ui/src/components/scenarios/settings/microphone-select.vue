<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { Button, FieldCombobox } from '@proj-airi/ui'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  label: string
  description?: string
  placeholder?: string
  options: { label: string, value: string }[]
  /**
   * Requests microphone access, so the browser lists its devices.
   * It resolves `false` or rejects when access is denied or no device opens.
   */
  requestAccess: () => Promise<boolean | void>
}>()

const selected = defineModel<string>({ required: true })

const { t } = useI18n()
const requesting = shallowRef(false)
const denied = shallowRef<string>()

/**
 * Browsers list microphones without IDs until the page has access, so the select has no options before then.
 * A request from this button is a user gesture, so the browser shows its permission prompt.
 */
async function allow() {
  requesting.value = true
  denied.value = undefined
  try {
    if (await props.requestAccess() === false)
      denied.value = t('settings.pages.modules.hearing.sections.section.input-device.allow-denied')
  }
  catch (cause) {
    denied.value = errorMessageFrom(cause) ?? t('settings.pages.modules.hearing.sections.section.input-device.allow-denied')
  }
  finally {
    requesting.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <FieldCombobox
      v-model="selected"
      :label="label"
      :description="description"
      :options="options"
      :placeholder="placeholder"
      layout="vertical"
    />
    <div
      v-if="options.length === 0"
      data-testid="microphone-select-access"
      :class="['flex flex-wrap items-center gap-x-3 gap-y-1', 'text-xs text-neutral-500 dark:text-neutral-400']"
    >
      <Button size="sm" :loading="requesting" @click="allow">
        <div :class="['i-solar:microphone-bold-duotone size-4']" />
        {{ t('settings.pages.modules.hearing.sections.section.input-device.allow') }}
      </Button>
      <span>{{ denied ?? t('settings.pages.modules.hearing.sections.section.input-device.allow-description') }}</span>
    </div>
  </div>
</template>
