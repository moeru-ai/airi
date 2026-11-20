<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useChatSessionStore } from '../../../../stores/chat/session-store'

/**
 * Shows above the composer while the conversation of this window is archived. The conversation is read-only until the
 * user restores it, so a message never goes to a conversation that the list hides. A failed restore explains itself
 * with a toast, as the other chat controls do, and the callout stays for another try.
 */
const { t } = useI18n()
const chatSession = useChatSessionStore()
const { activeSessionId } = storeToRefs(chatSession)
const restoring = shallowRef(false)

async function restore() {
  if (restoring.value)
    return
  restoring.value = true
  try {
    await chatSession.setSessionsArchived([activeSessionId.value], false)
  }
  catch (error) {
    toast.error(t('stage.chat.archived-session.restore-failed'), { description: errorMessageFrom(error) })
  }
  finally {
    restoring.value = false
  }
}
</script>

<template>
  <div
    role="status"
    :class="[
      'flex items-center gap-2 rounded-xl py-1.5 pl-3 pr-1.5',
      'bg-neutral-100/80 text-sm text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300',
    ]"
  >
    <span aria-hidden="true" :class="['i-mingcute:archive-line size-4 shrink-0 text-neutral-400 dark:text-neutral-500']" />
    <span :class="['min-w-0 flex-1']">{{ t('stage.chat.archived-session.description') }}</span>
    <Button size="sm" variant="secondary" :loading="restoring" :class="['shrink-0']" @click="restore">
      {{ t('stage.chat.archived-session.restore') }}
    </Button>
  </div>
</template>
