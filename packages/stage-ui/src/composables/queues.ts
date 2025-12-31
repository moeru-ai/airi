import type { Emotion } from '../constants/emotions'
import type { UseQueueReturn } from '../utils/queue'
import type { TTSChunkItem } from '../utils/tts'

import { sleep } from '@moeru/std'
import { invoke } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { EMOTION_VALUES } from '../constants/emotions'
import { createQueue } from '../utils/queue'
import { createControllableStream } from '../utils/stream'
import { chunkEmitter, TTS_SPECIAL_TOKEN } from '../utils/tts'

export interface TextSegmentationItem {
  type: 'literal' | 'special'
  value: string
}

export function useEmotionsMessageQueue(emotionsQueue: UseQueueReturn<Emotion>) {
  function splitEmotion(content: string) {
    for (const emotion of EMOTION_VALUES) {
      // doesn't include the emotion, continue
      if (!content.includes(emotion))
        continue

      return {
        ok: true,
        emotion: emotion as Emotion,
      }
    }

    return {
      ok: false,
      emotion: '' as Emotion,
    }
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        // if the message is an emotion, push the last content to the message queue
        if (EMOTION_VALUES.includes(ctx.data as Emotion)) {
          ctx.emit('emotion', ctx.data as Emotion)
          emotionsQueue.enqueue(ctx.data as Emotion)
          return
        }

        // otherwise we should process the message to find the emotions
        {
        // iterate through the message to find the emotions
          const { ok, emotion } = splitEmotion(ctx.data)
          if (ok) {
            ctx.emit('emotion', emotion)
            emotionsQueue.enqueue(emotion)
          }
        }
      },
    ],
  })
}

export function useDelayMessageQueue() {
  function splitDelays(content: string) {
    // doesn't include the delay, continue
    if (!(/<\|DELAY:\d+\|>/i.test(content))) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delayExecArray = /<\|DELAY:(\d+)\|>/i.exec(content)

    const delay = delayExecArray?.[1]
    if (!delay) {
      return {
        ok: false,
        delay: 0,
      }
    }

    const delaySeconds = Number.parseFloat(delay)

    if (delaySeconds <= 0 || Number.isNaN(delaySeconds)) {
      return {
        ok: true,
        delay: 0,
      }
    }

    return {
      ok: true,
      delay: delaySeconds,
    }
  }

  return createQueue<string>({
    handlers: [
      async (ctx) => {
        // iterate through the message to find the emotions
        const { ok, delay } = splitDelays(ctx.data)
        if (ok) {
          ctx.emit('delay', delay)
          await sleep(delay * 1000)
        }
      },
    ],
  })
}

export const usePipelineCharacterSpeechPlaybackQueueStore = defineStore('pipelines:character:speech', () => {
  // Hooks
  const onPlaybackStartedHooks = ref<Array<(payload: { text: string }) => Promise<void> | void>>([])
  const onPlaybackFinishedHooks = ref<Array<(payload: { special: string }) => Promise<void> | void>>([])

  // Hooks registers
  function onPlaybackStarted(hook: (payload: { text: string }) => Promise<void> | void) {
    onPlaybackStartedHooks.value.push(hook)
  }
  function onPlaybackFinished(hook: (payload: { special: string }) => Promise<void> | void) {
    onPlaybackFinishedHooks.value.push(hook)
  }

  const currentAudioSource = shallowRef<AudioBufferSourceNode>()

  const audioContext = shallowRef<AudioContext>()
  const audioAnalyser = shallowRef<AnalyserNode>()
  const lipSyncNode = shallowRef<AudioNode>()

  function connectAudioContext(context: AudioContext) {
    audioContext.value = context
  }

  function connectAudioAnalyser(analyser: AnalyserNode) {
    audioAnalyser.value = analyser
  }

  function connectLipSyncNode(node: AudioNode) {
    lipSyncNode.value = node
  }

  function clearPlaying() {
    if (currentAudioSource) {
      try {
        currentAudioSource.value?.stop()
        currentAudioSource.value?.disconnect()
      }
      catch {}
      currentAudioSource.value = undefined
    }
  }

  const playbackQueue = ref(invoke(() => {
    return createQueue<{ audioBuffer: AudioBuffer, text: string, special: string | null }>({
      handlers: [
        (ctx) => {
          return new Promise((resolve) => {
            // NOTICE: here clearPlaying is called because that createQueue guarantees that only one handler is running at a time,
            // so we can safely stop any currently playing audio before starting a new one. If multiple audios were to play
            // simultaneously, this would lead to overlapping sounds.
            //
            // TODO: when migrating to better solution for audio playback management, be careful with this part.
            // as without proper singleton gated, this may lead to audio cutoffs.
            clearPlaying()

            if (!audioContext.value) {
              resolve()
              return
            }

            // Create an AudioBufferSourceNode
            const source = audioContext.value.createBufferSource()
            source.buffer = ctx.data.audioBuffer

            // Connect the source to the AudioContext's destination (the speakers)
            source.connect(audioContext.value.destination)
            // Connect the source to the analyzer
            source.connect(audioAnalyser.value!)
            // Connect to lip sync tap if provided
            if (lipSyncNode.value)
              source.connect(lipSyncNode.value)

            // Start playing the audio
            for (const hook of onPlaybackStartedHooks.value) {
              try {
                hook({ text: ctx.data.text })
              }
              catch (err) {
                // NOTICE: onPlaybackStarted hook errors should not block audio playback.
                // in currently use case of Stage.vue, BroadcastChannel is involved,
                // navigating from pages may cause unexpected onUnmounted calls to close the channel,
                // which throws error when posting message to closed channel.
                //
                // TODO: we should consider better way to manage BroadcastChannel lifecycle to avoid such issues.
                console.error('Error in onPlaybackStarted hook:', err)
              }
            }

            currentAudioSource.value = source
            source.start(0)
            source.onended = () => {
              // Notify hooks regardless; consumers can decide how to use the special token (if any).
              for (const hook of onPlaybackFinishedHooks.value) {
                try {
                  hook({ special: ctx.data.special ?? '' })
                }
                catch (err) {
                  console.error('Error in onPlaybackFinished hook:', err)
                }
              }

              if (currentAudioSource.value === source) {
                currentAudioSource.value = undefined
              }
              resolve()
            }
          })
        },
      ],
    })
  }))

  function clearQueue() {
    playbackQueue.value.clear()
  }

  function clearAll() {
    clearPlaying()
    clearQueue()
  }

  return {
    onPlaybackStarted,
    onPlaybackFinished,

    connectAudioContext,
    connectAudioAnalyser,
    connectLipSyncNode,
    clearPlaying,
    clearQueue,
    clearAll,

    currentAudioSource,
    playbackQueue,
  }
})

export const usePipelineWorkflowTextSegmentationStore = defineStore('pipelines:workflows:text-segmentation', () => {
  // Hooks
  const onTextSegmentedHooks = ref<Array<(segment: TTSChunkItem) => Promise<void> | void>>([])

  // Hooks registers
  function onTextSegmented(hook: (segment: TTSChunkItem) => Promise<void> | void) {
    onTextSegmentedHooks.value.push(hook)
  }

  function clearHooks() {
    onTextSegmentedHooks.value = []
  }

  const textSegmentationQueue = ref(invoke(() => {
    const textSegmentationStream = ref()
    const textSegmentationStreamController = ref<ReadableStreamDefaultController<Uint8Array>>()

    const encoder = new TextEncoder()

    const { stream, controller } = createControllableStream<Uint8Array>()
    textSegmentationStream.value = stream
    textSegmentationStreamController.value = controller
    // This is the queue for pending special tokens
    const pendingSpecials: string[] = []

    chunkEmitter(stream.getReader(), pendingSpecials, async (chunk) => {
      for (const hook of onTextSegmentedHooks.value) {
        await hook(chunk)
      }
    })

    return createQueue<TextSegmentationItem>({
      handlers: [
        async (ctx) => {
          if (ctx.data.type === 'literal') {
            controller.enqueue(encoder.encode(ctx.data.value))
          }
          else {
            // Special literal, need to be flushed in tts rechunking
            // console.debug("TextSegmentationQueue: Special enqueue", encoder.encode(TTS_SPECIAL_TOKEN))
            pendingSpecials.push(ctx.data.value)
            controller.enqueue(encoder.encode(TTS_SPECIAL_TOKEN))
          }
        },
      ],
    })
  }))

  return {
    onTextSegmented,
    clearHooks,

    textSegmentationQueue,
  }
})
