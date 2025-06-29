import type { Ref } from 'vue'

import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ProgressInfoItem {
  filename: string
  progress: number
  currentSize: number
  totalSize: number
}

export type ProgressInfo = Map<string, Ref<ProgressInfoItem>>

export const useResourcesStore = defineStore('resources', () => {
  const resources = ref<ProgressInfo>(new Map())

  const appendResource = (event: { payload: [string, number] }) => {
    const [filename, progress] = event.payload

    const fileRef = ref<ProgressInfoItem>({
      filename,
      progress,
      currentSize: 0,
      totalSize: 100,
    })

    resources.value.set(filename, fileRef)
  }

  return {
    resources,
    appendResource,
  }
})
