import { defineStore } from 'pinia'

import { recordVoiceTurnDelivery } from '../services/speech/delivery'
import { createSpeechPipelineRuntime } from '../services/speech/pipeline-runtime'
import { holdVoiceDuringPlayback } from '../services/speech/voice-playback'
import { useSchedulerStore } from './scheduler'

export const useSpeechRuntimeStore = defineStore('speech-runtime', () => {
  const runtime = createSpeechPipelineRuntime()
  const scheduler = useSchedulerStore()
  let playback: ReturnType<typeof holdVoiceDuringPlayback> | undefined
  let voiceTurns: ReturnType<typeof recordVoiceTurnDelivery> | undefined

  function openIntent(options?: Parameters<typeof runtime.openIntent>[0]) {
    return runtime.openIntent(options)
  }

  /**
   * Makes this renderer's pipeline the speech host.
   * `recordDeliveredSpeech` receives the heard part of each interrupted voice turn that has a message.
   */
  async function registerHost(pipeline: Parameters<typeof runtime.registerHost>[0], options: { recordDeliveredSpeech: (sessionId: string, messageId: string, deliveredSpeech: string) => void }) {
    await runtime.registerHost(pipeline)
    // Only the host sees when a turn ends, so only the host keeps the voice during playback and records delivered speech.
    playback ??= holdVoiceDuringPlayback(pipeline, scheduler.leases)
    voiceTurns ??= recordVoiceTurnDelivery(pipeline, options.recordDeliveredSpeech)
  }

  /** Follows one voice turn of a session, so an interruption records the heard part on its message. */
  function startVoiceTurn(turnId: string, sessionId: string) {
    voiceTurns?.start(turnId, sessionId)
  }

  /** Names the message that a voice turn wrote. */
  function attachVoiceTurnMessage(turnId: string, messageId: string) {
    voiceTurns?.attach(turnId, messageId)
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
    voiceTurns?.stop()
    voiceTurns = undefined
    await runtime.dispose()
  }

  return {
    openIntent,
    registerHost,
    holdPlayback,
    startVoiceTurn,
    attachVoiceTurnMessage,
    isHost,
    dispose,
  }
})
