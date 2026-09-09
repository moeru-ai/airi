<script setup lang="ts">
import { Button, Callout, FieldCheckbox, TransitionVertical } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const keepData = defineModel<boolean>('keepData', { required: true })

const { t } = useI18n()
</script>

<template>
  <div :class="['flex flex-col gap-5']">
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.dialogs.signOut.description') }}
    </p>

    <div :class="['flex flex-col gap-3']">
      <FieldCheckbox
        v-model="keepData"
        :label="t('settings.dialogs.signOut.keep.label')"
        :disabled="loading"
      />

      <TransitionVertical>
        <Callout
          v-if="!keepData"
          theme="red"
          :label="t('settings.dialogs.signOut.reset.warning')"
        >
          <div :class="['text-sm']">
            {{ t('settings.dialogs.signOut.reset.description') }}
          </div>
        </Callout>
      </TransitionVertical>
    </div>

    <p
      v-if="error"
      :class="['text-sm text-red-500']"
      role="alert"
      aria-live="polite"
    >
      {{ error }}
    </p>

    <div :class="['flex justify-end gap-3']">
      <Button
        type="button"
        :disabled="loading"
        :label="t('settings.dialogs.signOut.cancel')"
        @click="emit('cancel')"
      />
      <Button
        type="button"
        :color="keepData ? 'neutral' : 'red'"
        variant="primary"
        :loading="loading"
        :label="keepData ? t('settings.dialogs.signOut.title') : t('settings.dialogs.signOut.titleReset')"
        @click="emit('confirm')"
      />
    </div>
  </div>
</template>
