<script setup lang="ts">
import { Button, FieldInput } from '@proj-airi/ui'
import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { computed, onMounted, ref, watch } from 'vue'

import { useBreakpoints } from '../../../../composables/use-breakpoints'

const props = withDefaults(defineProps<{
  open: boolean
  expectedText?: string
  title: string
  description: string
}>(), {
  expectedText: 'DELETE',
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:open', value: boolean): void
}>()

const { isDesktop } = useBreakpoints()
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

const inputText = ref('')

watch(() => props.open, (val) => {
  if (!val)
    inputText.value = ''
})

const isConfirmEnabled = computed(() => inputText.value === props.expectedText)

function onConfirm() {
  if (isConfirmEnabled.value) {
    emit('confirm')
  }
}

function onCancel() {
  emit('cancel')
  emit('update:open', false)
}
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="open" @update:open="value => emit('update:open', value)">
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-[9999] max-h-full max-w-md w-[92dvw] transform',
          'flex flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-xl outline-none',
          'backdrop-blur-md -translate-x-1/2 -translate-y-1/2',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
          'dark:bg-neutral-900',
        ]"
      >
        <div :class="['mb-4 flex flex-col gap-3']">
          <div :class="['flex items-center gap-3 text-red-500 dark:text-red-400']">
            <div class="i-lucide:alert-triangle h-6 w-6" />
            <DialogTitle :class="['text-lg font-semibold text-neutral-900 dark:text-neutral-100']">
              {{ title }}
            </DialogTitle>
          </div>
          <DialogDescription :class="['text-sm text-neutral-600 dark:text-neutral-300']">
            {{ description }}
          </DialogDescription>
        </div>

        <div :class="['flex flex-col gap-4']">
          <FieldInput
            v-model="inputText"
            :class="['w-full']"
            label="Confirmation"
            placeholder="Type DELETE to confirm"
          />
          <!-- TODO: i18n for label and placeholder -->

          <div :class="['mt-2 flex justify-end gap-3']">
            <!-- TODO: i18n for button labels -->
            <Button variant="secondary" @click="onCancel">
              Cancel
            </Button>
            <Button variant="danger" :disabled="!isConfirmEnabled" @click="onConfirm">
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DrawerRoot v-else :open="open" should-scale-background @update:open="value => emit('update:open', value)">
    <DrawerPortal>
      <DrawerOverlay
        :class="[
          'fixed inset-0 z-1000 bg-black/35 backdrop-blur-sm',
        ]"
      />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-1000 mt-20 h-auto max-h-[90%]',
          'flex flex-col rounded-t-[32px] bg-neutral-50/95 px-4 pt-4 outline-none',
          'backdrop-blur-md dark:bg-neutral-900/95',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <VisuallyHidden>
          <DialogTitle>{{ title }}</DialogTitle>
        </VisuallyHidden>
        <DrawerHandle
          :class="[
            '[div&]:bg-neutral-400 [div&]:dark:bg-neutral-600',
          ]"
        />

        <div :class="['mb-4 mt-4 flex flex-col gap-3']">
          <div :class="['flex items-center gap-3 text-red-500 dark:text-red-400']">
            <div class="i-lucide:alert-triangle h-6 w-6" />
            <div :class="['text-lg font-semibold text-neutral-900 dark:text-neutral-100']">
              {{ title }}
            </div>
          </div>
          <div :class="['text-sm text-neutral-600 dark:text-neutral-300']">
            {{ description }}
          </div>
        </div>

        <div :class="['mb-6 flex flex-col gap-4']">
          <FieldInput
            v-model="inputText"
            :class="['w-full']"
            label="Confirmation"
            placeholder="Type DELETE to confirm"
          />
          <!-- TODO: i18n for label and placeholder -->

          <div :class="['mt-4 flex flex-col gap-3']">
            <!-- TODO: i18n for button labels -->
            <Button variant="danger" block :disabled="!isConfirmEnabled" @click="onConfirm">
              Confirm
            </Button>
            <Button variant="secondary" block @click="onCancel">
              Cancel
            </Button>
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
