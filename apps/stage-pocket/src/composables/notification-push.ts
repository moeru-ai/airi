import type { AssistantMessage } from '@xsai/shared-chat'

import { LocalNotifications } from '@capacitor/local-notifications'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useLocalStorage } from '@vueuse/core'
import { ref, watch } from 'vue'

function extractTextFromMessage(message: AssistantMessage): string {
  const { content } = message

  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string')
        return part
      if (part && typeof part === 'object' && 'text' in part)
        return String(part.text ?? '')
      return ''
    }).join('')
  }

  return ''
}

export function useNotificationPush() {
  const serverChannelStore = useModsServerChannelStore()
  const enabled = useLocalStorage('settings/notifications/push-enabled', true)
  const permissionGranted = ref(false)
  const cleanupFn = ref<(() => void) | null>(null)

  // NOTICE: try/catch needed because LocalNotifications throws in web environment
  async function checkPermission(): Promise<boolean> {
    try {
      const permission = await LocalNotifications.checkPermissions()
      permissionGranted.value = permission.display === 'granted'
      return permissionGranted.value
    }
    catch {
      return false
    }
  }

  async function requestPermission(): Promise<boolean> {
    try {
      const permission = await LocalNotifications.checkPermissions()
      if (permission.display === 'granted') {
        permissionGranted.value = true
        return true
      }
      if (permission.display === 'denied') {
        permissionGranted.value = false
        return false
      }
      const result = await LocalNotifications.requestPermissions()
      permissionGranted.value = result.display === 'granted'
      return permissionGranted.value
    }
    catch {
      return false
    }
  }

  async function sendNotification(title: string, body: string) {
    if (!enabled.value)
      return
    if (document.visibilityState === 'visible')
      return

    const hasPermission = await checkPermission()
    if (!hasPermission)
      return

    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 1000000),
        title,
        body,
      }],
    })
  }

  function setupEventListener() {
    const client = serverChannelStore.client
    if (!client)
      return

    const handler = async (event: { data: { message: AssistantMessage } }) => {
      const text = extractTextFromMessage(event.data.message)
      if (!text.trim())
        return

      const truncatedText = text.length > 200 ? `${text.slice(0, 200)}...` : text
      await sendNotification('AIRI', truncatedText)
    }

    client.onEvent('output:gen-ai:chat:complete', handler)
    cleanupFn.value = () => client.offEvent('output:gen-ai:chat:complete', handler)
  }

  function cleanup() {
    if (cleanupFn.value) {
      cleanupFn.value()
      cleanupFn.value = null
    }
  }

  watch(() => serverChannelStore.client, (newClient) => {
    cleanup()
    if (newClient)
      setupEventListener()
  }, { immediate: true })

  return {
    enabled,
    permissionGranted,
    checkPermission,
    requestPermission,
    cleanup,
  }
}
