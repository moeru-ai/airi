<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { Button, FieldInput } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'

import { initializeHostContext } from '../../host-context/owner'

const title = useLocalStorage('devtools/notifications/title', '')
const content = useLocalStorage('devtools/notifications/content', '')
const { notifications } = initializeHostContext()

async function sendNotification() {
  try {
    await notifications.show({
      id: crypto.randomUUID(),
      title: title.value,
      body: content.value,
    })
  }
  catch (error) {
    toast.error(errorMessageFrom(error) ?? String(error))
  }
}
</script>

<template>
  <div class="h-[calc(100dvh-40px)]">
    <div class="relative h-full">
      <div class="flex flex-col gap-4">
        <div class="rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
          <FieldInput v-model="title" label="Title" description="The title of the notification" />
        </div>
        <div class="rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
          <FieldInput v-model="content" label="Content" description="The content of the notification" />
        </div>
        <Button @click="sendNotification">
          Send Notification
        </Button>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
