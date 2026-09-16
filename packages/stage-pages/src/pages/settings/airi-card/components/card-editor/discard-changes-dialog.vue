<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'CardEditorDiscardChangesDialog' })

const emit = defineEmits<{
  discard: []
}>()
const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="open = $event">
    <AlertDialogPortal>
      <AlertDialogOverlay :class="['fixed', 'inset-0', 'z-110', 'bg-black/50', 'backdrop-blur-sm']" />
      <AlertDialogContent
        :class="[
          'fixed', 'left-1/2', 'top-1/2', 'z-110', 'w-[min(28rem,90vw)]',
          '-translate-x-1/2', '-translate-y-1/2',
          'rounded-xl', 'border', 'border-neutral-200', 'bg-white', 'p-5', 'shadow-xl',
          'dark:border-neutral-700', 'dark:bg-neutral-800',
        ]"
        @interact-outside.prevent
      >
        <AlertDialogTitle class="text-lg font-medium">
          {{ t('settings.pages.card.unsaved_changes.title') }}
        </AlertDialogTitle>
        <AlertDialogDescription class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.card.unsaved_changes.description') }}
        </AlertDialogDescription>

        <div :class="['mt-6', 'flex', 'justify-end', 'gap-2']">
          <AlertDialogCancel as-child>
            <Button variant="secondary" :label="t('settings.pages.card.unsaved_changes.keep_editing')" />
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <Button variant="primary" :label="t('settings.pages.card.unsaved_changes.discard')" @click="emit('discard')" />
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
