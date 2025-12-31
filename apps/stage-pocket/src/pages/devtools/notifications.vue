<script setup lang="ts">
import { LocalNotifications } from '@capacitor/local-notifications'
import { Button, FieldInput } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'

const title = useLocalStorage('devtools/notifications/title', '')
const content = useLocalStorage('devtools/notifications/content', '')

async function sendNotification() {
  const permission = await LocalNotifications.checkPermissions()
  if (permission.display === 'denied') {
    return toast.error('Notification permission denied, please enable it in settings')
  }
  if (permission.display !== 'granted') {
    await LocalNotifications.requestPermissions()
  }
  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Math.random() * 1000000),
        title: title.value,
        body: content.value,
        schedule: {
          at: new Date(Date.now() + 5000),
        },
      },
    ],
  })
}
</script>

<template>
  <div h="[calc(100dvh-40px)]">
    <div relative h-full>
      <div flex="~ col gap-4">
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
