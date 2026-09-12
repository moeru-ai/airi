<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { BottomDrawer } from '@proj-airi/ui'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'
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

const keepData = shallowRef(true)
const loading = shallowRef(false)
const errorMessage = shallowRef<string | null>(null)

const title = computed(() => keepData.value
  ? t('settings.dialogs.signOut.title')
  : t('settings.dialogs.signOut.titleReset'))

watch(open, (isOpen) => {
  errorMessage.value = null
  if (isOpen)
    keepData.value = true
})

async function runLeave() {
  if (loading.value)
    return

  loading.value = true
  errorMessage.value = null

  try {
    // Chat reset keys off the current user id. Wipe after sign-out would hit
    // the anonymous `local` user instead of the account that is leaving.
    if (!keepData.value)
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
    v-model="open"
    :title="title"
  >
    <SignOutBody
      v-model:keep-data="keepData"
      :loading="loading"
      :error="errorMessage"
      @confirm="runLeave"
      @cancel="open = false"
    />
  </BottomDrawer>

  <DialogRoot
    v-else
    v-model:open="open"
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
      >
        <DialogTitle
          :class="[
            'mb-5 text-xl font-semibold tracking-tight',
            !keepData && 'text-red-600 dark:text-red-300',
          ]"
        >
          {{ title }}
        </DialogTitle>
        <SignOutBody
          v-model:keep-data="keepData"
          :loading="loading"
          :error="errorMessage"
          @confirm="runLeave"
          @cancel="open = false"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
