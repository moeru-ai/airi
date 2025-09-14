import type { Analyser, AnalyserListeners, AnalyserWorkletParameters } from '@nekopaw/tempora'

import analyserWorklet from '@nekopaw/tempora/worklet?url'

import { startAnalyser as startTemporaAnalyser } from '@nekopaw/tempora'
import { defineStore } from 'pinia'
import { readonly, ref, shallowRef } from 'vue'

export type BeatSyncEvent = 'beat'

export interface BeatSyncEventCallbacks {
  beat: Required<AnalyserListeners>['onBeat']
}

export const useBeatSyncStore = defineStore('beat-sync', () => {
  const context = shallowRef<AudioContext>()
  const analyser = shallowRef<Analyser>()
  const source = shallowRef<AudioNode>()
  const isActive = ref(false)

  let stopSource: (() => void) | undefined

  const onBeatListeners: Array<Required<AnalyserListeners>['onBeat']> = []

  const stop = () => {
    if (!isActive.value)
      return

    isActive.value = false
    stopSource?.()
    stopSource = undefined

    source.value?.disconnect()
    source.value = undefined

    analyser.value?.stop()
    analyser.value = undefined

    context.value?.close()
    context.value = undefined
  }

  const start = async (createSource: (context: AudioContext) => Promise<AudioNode>) => {
    stop()

    context.value = new AudioContext()
    analyser.value = await startTemporaAnalyser({
      context: context.value,
      worklet: analyserWorklet,
      listeners: {
        onBeat: (...args) => {
          onBeatListeners.forEach(listener => listener(...args))
        },
      },
    })

    const node = await createSource(context.value)
    node.connect(analyser.value.workletNode)
    source.value = node

    isActive.value = true
  }

  const updateParameters = (params: Partial<AnalyserWorkletParameters>) => {
    analyser.value?.updateParameters(params)
  }

  const startFromScreenCapture = async () => start(async (context) => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 22050,
      },
      video: true,
    })

    if (stream.getAudioTracks().length === 0) {
      throw new Error('No audio track available in the stream')
    }

    stream.getAudioTracks().forEach((track) => {
      let stopCalled = false
      track.addEventListener('ended', () => {
        if (stopCalled)
          return

        stopCalled = true
        stop()
      })
    })

    const node = context.createMediaStreamSource(stream)
    stopSource = () => {
      stream.getTracks().forEach(track => track.stop())
    }

    return node
  })

  const on = <E extends BeatSyncEvent>(event: E, callback: BeatSyncEventCallbacks[E]) => {
    switch (event) {
      case 'beat':
        onBeatListeners.push(callback)
        break
      default:
        throw new Error(`Unknown event: ${event}`)
    }
  }

  const off = <E extends BeatSyncEvent>(event: E, callback: BeatSyncEventCallbacks[E]) => {
    switch (event) {
      case 'beat': {
        const index = onBeatListeners.indexOf(callback)
        if (index !== -1)
          onBeatListeners.splice(index, 1)
        break
      }
      default:
        throw new Error(`Unknown event: ${event}`)
    }
  }

  return {
    start,
    updateParameters,
    startFromScreenCapture,
    stop,
    on,
    off,

    isActive: readonly(isActive),

    context: readonly(context),
    analyser: readonly(analyser),
    source: readonly(source),
  }
})
