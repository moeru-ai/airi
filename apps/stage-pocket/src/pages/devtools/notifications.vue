<script setup lang="ts">
import { LocalNotifications } from '@capacitor/local-notifications'
import { Button, FieldInput } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'

import { isKirieAndroid } from '../../modules/kirie-android-eventa'
import { scheduleKirieAndroidNotification } from '../../modules/kirie-android-notifications'
import {
  checkKirieAndroidPermission,
  requestKirieAndroidPermission,
} from '../../modules/kirie-android-permissions'

const title = useLocalStorage('devtools/notifications/title', '')
const content = useLocalStorage('devtools/notifications/content', '')
const notificationPermissionRequested = useLocalStorage('permissions/notifications/requested', false)

async function sendNotification() {
  if (isKirieAndroid) {
    const permission = await checkKirieAndroidPermission('notifications')
    if (!permission.granted && notificationPermissionRequested.value)
      return toast.error('Notification permission denied, please enable it in settings')
    if (!permission.granted) {
      notificationPermissionRequested.value = true
      await requestKirieAndroidPermission('notifications')
    }

    await scheduleKirieAndroidNotification({
      at: Date.now() + 5000,
      body: content.value,
      id: Math.floor(Math.random() * 1000000),
      title: title.value,
    })
    return
  }

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
