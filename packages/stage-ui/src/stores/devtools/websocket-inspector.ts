import type { WebSocketEvent } from '@proj-airi/server-sdk'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface WebSocketHistoryItem {
  id: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
  event: WebSocketEvent
}

export const useWebSocketInspectorStore = defineStore('devtools:websocket-inspector', () => {
  const history = ref<WebSocketHistoryItem[]>([])
  const isEnabled = ref(true)
  const maxHistory = ref(1000)

  function add(direction: 'incoming' | 'outgoing', event: WebSocketEvent) {
    if (!isEnabled.value)
      return

    history.value.unshift({
      id: nanoid(),
      timestamp: Date.now(),
      direction,
      event,
    })

    if (history.value.length > maxHistory.value) {
      history.value.pop()
    }
  }

  function clear() {
    history.value = []
  }

  return {
    history,
    isEnabled,
    maxHistory,
    add,
    clear,
  }
})
