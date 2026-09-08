<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { BottomDrawer } from '@proj-airi/ui'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SignOutBody from './sign-out-body.vue'

import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { useDataMaintenance } from '../../../../composables/use-data-maintenance'
import { signOut } from '../../../../libs/auth'

const emit = defineEmits<{
  signedOut: []
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const { isDesktop } = useBreakpoints()

const loading = shallowRef(false)
const errorMessage = shallowRef<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) {
    loading.value = false
    errorMessage.value = null
  }
})

function onOpenChange(value: boolean) {
  if (loading.value && !value)
    return
  open.value = value
}

function preventDismissWhileLoading(event: Event) {
  if (loading.value)
    event.preventDefault()
}

async function runLeave(resetDevice: boolean) {
  if (loading.value)
    return

  loading.value = true
  errorMessage.value = null

  try {
    // Chat reset keys off the current user id. Wipe after sign-out would hit
    // the anonymous `local` user instead of the account that is leaving.
    if (resetDevice)
      await useDataMaintenance().deleteAllData()

    await signOut()
    open.value = false
    emit('signedOut')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.dialogs.signOut.error')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <BottomDrawer
    v-if="!isDesktop"
    :model-value="open"
    :title="t('settings.dialogs.signOut.title')"
    @update:model-value="onOpenChange"
  >
    <SignOutBody
      :loading="loading"
      :error="errorMessage"
      :cancel-block="true"
      @sign-out="runLeave(false)"
      @reset-device="runLeave(true)"
      @cancel="onOpenChange(false)"
    />
  </BottomDrawer>

  <DialogRoot
    v-else
    :open="open"
    @update:open="onOpenChange"
  >
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :aria-describedby="undefined"
        :class="[
          'fixed left-1/2 top-1/2 z-[9999] max-h-[90dvh] max-w-md w-[92dvw] overflow-y-auto',
          '-translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl outline-none',
          'dark:bg-neutral-900 dark:text-neutral-100',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
        ]"
        @escape-key-down="preventDismissWhileLoading"
        @interact-outside="preventDismissWhileLoading"
      >
        <DialogTitle :class="['mb-5 text-xl font-semibold tracking-tight']">
          {{ t('settings.dialogs.signOut.title') }}
        </DialogTitle>
        <SignOutBody
          :loading="loading"
          :error="errorMessage"
          :cancel-block="false"
          @sign-out="runLeave(false)"
          @reset-device="runLeave(true)"
          @cancel="onOpenChange(false)"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
