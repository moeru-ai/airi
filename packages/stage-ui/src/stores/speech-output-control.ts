import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface StopRequest {
  reason: string
  timestamp: number
}

export const useSpeechOutputControlStore = defineStore('speech-output-control', () => {
  const latestStopRequest = ref<StopRequest | undefined>(undefined)

  function requestStop(reason: string) {
    latestStopRequest.value = { reason, timestamp: Date.now() }
  }

  function clearStopRequest() {
    latestStopRequest.value = undefined
  }

  return { latestStopRequest, requestStop, clearStopRequest }
})
