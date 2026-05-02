import type { GatewayDiagnostics } from '@proj-airi/visual-chat-protocol'

import type { GatewayClient } from '../client'

import { onUnmounted, ref } from 'vue'

export function useSessionStatus(client: GatewayClient, pollIntervalMs: number = 5000) {
  const diagnostics = ref<GatewayDiagnostics | null>(null)
  const healthy = ref(false)
  const loading = ref(false)

  let timer: ReturnType<typeof setInterval> | null = null

  async function poll() {
    loading.value = true
    try {
      healthy.value = await client.health()
      if (healthy.value)
        diagnostics.value = await client.getDiagnostics()
    }
    catch {
      healthy.value = false
    }
    finally {
      loading.value = false
    }
  }

  function startPolling() {
    poll()
    timer = setInterval(poll, pollIntervalMs)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onUnmounted(stopPolling)

  return {
    diagnostics,
    healthy,
    loading,
    poll,
    startPolling,
    stopPolling,
  }
}
