<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  busy: boolean
  open: boolean
}>()

const emit = defineEmits<{
  allow: []
  deny: []
}>()

const { t } = useI18n()

function handleOpenChange(open: boolean) {
  if (!open)
    emit('deny')
}
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-9999 rounded-xl bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-9999 max-h-full max-w-2xl w-[92dvw]',
          'flex flex-col items-start gap-4 overflow-y-scroll rounded-2xl bg-white p-6 shadow-xl outline-none',
          'backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 dark:bg-neutral-900',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
        ]"
      >
        <DialogTitle :class="['m-0 text-lg font-semibold']">
          {{ t('tamagotchi.settings.microphone-permission.prompt.title') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('tamagotchi.settings.microphone-permission.prompt.description') }}
        </DialogDescription>

        <div :class="['mt-4 w-full flex justify-end gap-2']">
          <Button
            :disabled="busy"
            :label="t('tamagotchi.settings.microphone-permission.prompt.deny')"
            @click="emit('deny')"
          />
          <Button
            color="primary"
            variant="primary"
            :disabled="busy"
            :loading="busy"
            :label="t('tamagotchi.settings.microphone-permission.prompt.allow')"
            @click="emit('allow')"
          />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
