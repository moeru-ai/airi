<script setup lang="ts">
import { Button, FieldInput } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'

import { scheduleAndroidNotification } from '../../host-context/android-notifications'
import { useHostAndroidPermissions } from '../../host-context/android-permissions'

const title = useLocalStorage('devtools/notifications/title', '')
const content = useLocalStorage('devtools/notifications/content', '')
const permissions = useHostAndroidPermissions()

async function sendNotification() {
  let permission = await permissions.check('notifications')
  if (permission.state === 'denied')
    return toast.error('Notification permission denied, please enable it in settings')

  if (!permission.granted)
    permission = await permissions.request('notifications')
  if (!permission.granted)
    return

  await scheduleAndroidNotification({
    at: Date.now() + 5000,
    notification: {
      id: Math.floor(Math.random() * 1000000),
      title: title.value,
      body: content.value,
    },
  })
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
