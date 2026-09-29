<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

interface Props {
  modelValue: boolean
  cardName?: string
  pending?: boolean
  error?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()

function handleCancel() {
  if (props.pending)
    return
  emit('update:modelValue', false)
  emit('cancel')
}

function handleConfirm() {
  if (!props.pending)
    emit('confirm')
}
</script>

<template>
  <AlertDialogRoot :open="modelValue" @update:open="!pending && emit('update:modelValue', $event)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-100 bg-black/50 data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-100 max-w-md w-full border border-neutral-200 rounded-xl bg-white p-6 shadow-xl -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-800"
        @interact-outside.prevent
      >
        <AlertDialogTitle class="mb-4 text-xl font-normal">
          {{ t('settings.pages.card.delete_card') }}
        </AlertDialogTitle>
        <AlertDialogDescription class="mb-6">
          {{ t('settings.pages.card.delete_confirmation') }} <b>"{{ cardName || '' }}"</b>
        </AlertDialogDescription>
        <p v-if="error" role="alert" :class="['mb-4 text-sm text-red-600 dark:text-red-400']">
          {{ error }}
        </p>

        <div class="flex flex-row justify-end gap-3">
          <AlertDialogCancel as-child>
            <Button

              :label="t('settings.pages.card.cancel')"
              :disabled="pending"
              @click="handleCancel"
            />
          </AlertDialogCancel>
          <Button
            :loading="pending"
            :label="t('settings.pages.card.delete')"
            color="red"
            variant="primary" @click="handleConfirm"
          />
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
