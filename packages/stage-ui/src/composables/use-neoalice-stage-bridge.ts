import type { NeoAliceBridgeEvent } from '@proj-airi/alice-motion'

import type { StageEmote } from '../libs/alice-motion/stage-motion'

import { errorMessageFrom } from '@moeru/std'
import { onScopeDispose, ref, watch } from 'vue'

import { StageMotionRuntime } from '../libs/alice-motion/stage-motion'
import { useNeoAliceBridgeStore } from '../stores/modules/neoalice-bridge'

export interface NeoAliceStageBridgeOptions {
  /** Plays a clip of the VRM stage. Resolves `false` when the stage is not VRM or has no such clip. */
  playClip: (clipId: string) => Promise<boolean>
  /** Emotes of the VRM motion library, including imported VRMA files. */
  emotes: () => readonly StageEmote[]
  /** Synthesizes text with the AIRI voice settings. Resolves `null` when no voice is configured. */
  synthesize: (text: string, signal: AbortSignal) => Promise<Blob | null>
  /** Plays speech audio on the stage output, with lip sync. Resolves when it ends or stops. */
  playSpeech: (audio: Blob, text: string) => Promise<void>
  stopSpeech: () => void
  /** Shows text that is not spoken, for example in the silent speech mode. */
  showCaption: (text: string) => void
  /** Applies an AIRI emotion name, for example `happy`, with an intensity from 0 to 1. */
  applyEmotion: (emotion: string, intensity: number) => void
}

/** The bridge stops thinking after this time without speech, so a lost reply cannot freeze the pose. */
const thinkingTimeoutMs = 20_000
/** The motion runtime ticks on this interval. It only starts cues. Frames play the clips on their own clock. */
const tickIntervalMs = 100

/**
 * Mounted stages that use the bridge, in mount order. Only the first one plays bridge events,
 * so a second stage, for example a settings preview, never speaks the same line again.
 */
const mountedStages: symbol[] = []

/**
 * Connects the NeoAlice bridge (S08) to the stage.
 *
 * It holds the read-only MQTT connection while the stage is mounted, and turns bridge events into
 * speech, captions, moods, and motion cues. Motion goes through the director (S03) and the scheduler (S04).
 */
export function useNeoAliceStageBridge(options: NeoAliceStageBridgeOptions) {
  const bridge = useNeoAliceBridgeStore()
  const runtime = new StageMotionRuntime({
    playClip: options.playClip,
    log: message => console.info(`[neoalice-bridge] ${message}`),
  })
  /** `true` from the final user transcript until the speech starts. The VRM shows the thinking pose. */
  const thinking = ref(false)
  let thinkingSinceMs = 0
  let speechSequence = 0
  let currentSession: string | undefined
  const sessionsOfConnection = new Set<string>()
  let synthesis: AbortController | undefined

  const clock = () => performance.now()

  watch(options.emotes, emotes => runtime.setEmotes(emotes), { immediate: true })

  async function speak(sessionId: string, text: string, audio: () => Promise<Blob | null>) {
    const now = clock()
    currentSession = sessionId
    sessionsOfConnection.add(sessionId)
    thinking.value = false
    runtime.speechStarted(sessionId, now)
    try {
      const blob = await audio()
      if (blob && currentSession === sessionId)
        await options.playSpeech(blob, text)
      else if (text)
        options.showCaption(text)
    }
    catch (error) {
      console.warn('[neoalice-bridge] speech failed:', errorMessageFrom(error) ?? 'unknown error')
      if (text)
        options.showCaption(text)
    }
    finally {
      runtime.speechEnded(sessionId, clock())
      if (currentSession === sessionId)
        currentSession = undefined
    }
  }

  function stopCurrentSpeech() {
    synthesis?.abort()
    synthesis = undefined
    options.stopSpeech()
    if (currentSession) {
      runtime.director.interrupt(clock())
      runtime.cancelSession(currentSession, clock())
      currentSession = undefined
    }
  }

  function handle(event: NeoAliceBridgeEvent) {
    const now = clock()
    switch (event.type) {
      case 'speech-text': {
        speechSequence++
        const sessionId = event.sessionId ?? `neoalice-${speechSequence}`
        if (bridge.speechMode !== 'airi-voice') {
          options.showCaption(event.text)
          return
        }
        synthesis?.abort()
        const controller = new AbortController()
        synthesis = controller
        void speak(sessionId, event.text, () => options.synthesize(event.text, controller.signal))
        return
      }
      case 'speech-audio': {
        speechSequence++
        const sessionId = event.sessionId ?? `neoalice-${speechSequence}`
        if (bridge.speechMode === 'silent') {
          if (event.text)
            options.showCaption(event.text)
          return
        }
        void speak(sessionId, event.text, async () => base64ToWav(event.audioBase64))
        return
      }
      case 'speech-stop':
        stopCurrentSpeech()
        return
      case 'user-speech':
        runtime.director.userStartedSpeaking(now)
        runtime.director.userFinishedSpeaking(now)
        thinking.value = true
        thinkingSinceMs = now
        return
      case 'mood':
        runtime.director.setAffect(event.mood.airiEmotion, event.intensity)
        options.applyEmotion(event.mood.airiEmotion, event.intensity ?? 1)
        return
      case 'intent':
      {
        const result = runtime.submit({ ...event.intent, timestampMs: Math.round(now) }, now)
        if (!result.ok)
          console.info(`[neoalice-bridge] refused ${event.intent.semanticAction}: ${result.reason}`)
        break
      }
      default:
        break
    }
  }

  const token = Symbol('neoalice-stage')
  mountedStages.push(token)
  const stopEvents = bridge.onEvent((event) => {
    if (mountedStages[0] === token)
      handle(event)
  })
  // A reconnection can replay retained or queued messages. The sessions of the old connection never play again.
  const stopReconnect = bridge.onReconnect(() => {
    const now = clock()
    for (const sessionId of sessionsOfConnection)
      runtime.cancelSession(sessionId, now)
    sessionsOfConnection.clear()
  })
  const release = bridge.hold()
  const timer = setInterval(() => {
    const now = clock()
    if (thinking.value && now - thinkingSinceMs > thinkingTimeoutMs)
      thinking.value = false
    void runtime.tick(now)
  }, tickIntervalMs)

  onScopeDispose(() => {
    mountedStages.splice(mountedStages.indexOf(token), 1)
    clearInterval(timer)
    stopEvents.off()
    stopReconnect.off()
    synthesis?.abort()
    release()
  })

  return { thinking, runtime }
}

/** Decodes base64 WAV from `cmd/tts/audio`. Returns `null` for broken base64. */
export function base64ToWav(base64: string): Blob | null {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: 'audio/wav' })
  }
  catch {
    return null
  }
}
