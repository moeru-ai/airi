import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { createSpeechPipelineRuntime } from '../services/speech/pipeline-runtime'

export const useSpeechRuntimeStore = defineStore('speech-runtime', () => {
  const runtime = createSpeechPipelineRuntime()
  const playbackController = shallowRef<{
    stopByOwner?: (ownerId: string, reason: string) => void
    stopAll?: (reason: string) => void
  }>()

  function openIntent(options?: Parameters<typeof runtime.openIntent>[0]) {
    return runtime.openIntent(options)
  }

  async function registerHost(pipeline: Parameters<typeof runtime.registerHost>[0]) {
    await runtime.registerHost(pipeline)
  }

  function isHost() {
    return runtime.isHost()
  }

  function registerPlaybackController(controller: {
    stopByOwner?: (ownerId: string, reason: string) => void
    stopAll?: (reason: string) => void
  }) {
    playbackController.value = controller
  }

  function clearPlaybackController() {
    playbackController.value = undefined
  }

  function stopByOwner(ownerId: string, reason: string = 'stop-by-owner') {
    playbackController.value?.stopByOwner?.(ownerId, reason)
  }

  function stopAll(reason: string = 'stop-all') {
    playbackController.value?.stopAll?.(reason)
  }

  async function dispose() {
    await runtime.dispose()
  }

  return {
    openIntent,
    registerHost,
    isHost,
    registerPlaybackController,
    clearPlaybackController,
    stopByOwner,
    stopAll,
    dispose,
  }
})
