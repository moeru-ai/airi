import { defineStore } from 'pinia'

import { createSpeechPipelineRuntime } from '../services/speech/pipeline-runtime'
import { holdVoiceDuringPlayback } from '../services/speech/voice-playback'
import { useSchedulerStore } from './scheduler'

export const useSpeechRuntimeStore = defineStore('speech-runtime', () => {
  const runtime = createSpeechPipelineRuntime()
  const scheduler = useSchedulerStore()
  let playback: ReturnType<typeof holdVoiceDuringPlayback> | undefined

  function openIntent(options?: Parameters<typeof runtime.openIntent>[0]) {
    return runtime.openIntent(options)
  }

  async function registerHost(pipeline: Parameters<typeof runtime.registerHost>[0]) {
    await runtime.registerHost(pipeline)
    // Only the host sees when a turn ends, so only the host can keep the voice during playback.
    playback ??= holdVoiceDuringPlayback(pipeline, scheduler.leases)
  }

  /**
   * Keeps the voice for a turn that still plays after its run ends. Call it before the run releases its leases.
   * Returns false in a renderer that does not host speech, or when the turn has nothing left to play.
   */
  function holdPlayback(turnId: string, runId: string) {
    return playback?.hold(turnId, runId) ?? false
  }

  function isHost() {
    return runtime.isHost()
  }

  async function dispose() {
    playback?.stop()
    playback = undefined
    await runtime.dispose()
  }

  return {
    openIntent,
    registerHost,
    holdPlayback,
    isHost,
    dispose,
  }
})
