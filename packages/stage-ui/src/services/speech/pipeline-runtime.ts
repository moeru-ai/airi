import type { createSpeechPipeline, IntentHandle, IntentOptions, TextToken } from '@proj-airi/pipelines-audio'

import type { SpeechIntentStartPayload, SpeechIntentTokenPayload } from './bus'

import { createPushStream } from '@proj-airi/pipelines-audio'
import { Mutex } from 'es-toolkit'
import { nanoid } from 'nanoid'

import {
  getSpeechBusContext,
  speechIntentCancelEvent,
  speechIntentEndEvent,
  speechIntentFlushEvent,
  speechIntentLiteralEvent,
  speechIntentSpecialEvent,
  speechIntentStartEvent,
} from './bus'

function createId(prefix: string) {
  return `${prefix}-${nanoid()}`
}

export interface SpeechPipelineRuntime {
  openIntent: (options?: IntentOptions) => IntentHandle
  registerHost: (pipeline: ReturnType<typeof createSpeechPipeline<AudioBuffer>>) => Promise<void>
  unregisterHost: (pipeline?: ReturnType<typeof createSpeechPipeline<AudioBuffer>>) => Promise<void>
  isHost: () => boolean
  dispose: () => Promise<void>
}

export function createSpeechPipelineRuntime(): SpeechPipelineRuntime {
  const mutex = new Mutex()
  const originId = `speech-${nanoid()}`

  let hostPipeline: ReturnType<typeof createSpeechPipeline<AudioBuffer>> | null = null
  let hostReady = false
  let bound = false

  const remoteIntentMap = new Map<string, IntentHandle>()
  const context = getSpeechBusContext()

  function bindSpeechBusToHost() {
    if (bound)
      return
    bound = true

    context.on(speechIntentStartEvent, (evt) => {
      const payload = (evt as { body?: SpeechIntentStartPayload })?.body
      if (!payload || payload.originId === originId)
        return

      if (!hostPipeline)
        return

      if (remoteIntentMap.has(payload.intentId))
        return

      const intent = hostPipeline.openIntent({
        intentId: payload.intentId,
        streamId: payload.streamId,
        ownerId: payload.ownerId,
        priority: payload.priority,
        behavior: payload.behavior,
      })

      remoteIntentMap.set(payload.intentId, intent)
    })

    const applyToken = (payload: SpeechIntentTokenPayload, writer: (intent: IntentHandle, value?: string) => void) => {
      if (!payload || payload.originId === originId)
        return
      const intent = remoteIntentMap.get(payload.intentId)
      if (!intent) {
        if (!hostPipeline)
          return
        const fallback = hostPipeline.openIntent({ intentId: payload.intentId, streamId: payload.streamId })
        remoteIntentMap.set(payload.intentId, fallback)
        writer(fallback, payload.value)
        return
      }
      writer(intent, payload.value)
    }

    context.on(speechIntentLiteralEvent, (evt) => {
      const payload = evt?.body
      if (!payload)
        return

      applyToken(payload, (intent, value) => {
        if (value)
          intent.writeLiteral(value)
      })
    })

    context.on(speechIntentSpecialEvent, (evt) => {
      const payload = evt?.body
      if (!payload)
        return

      applyToken(payload, (intent, value) => {
        if (value)
          intent.writeSpecial(value)
      })
    })

    context.on(speechIntentFlushEvent, (evt) => {
      const payload = evt?.body
      if (!payload)
        return

      applyToken(payload, (intent) => {
        intent.writeFlush()
      })
    })

    context.on(speechIntentEndEvent, (evt) => {
      const payload = evt?.body
      if (!payload || payload.originId === originId)
        return
      const intent = remoteIntentMap.get(payload.intentId)
      if (!intent)
        return
      intent.end()
      remoteIntentMap.delete(payload.intentId)
    })

    context.on(speechIntentCancelEvent, (evt) => {
      const payload = evt?.body
      if (!payload || payload.originId === originId)
        return
      const intent = remoteIntentMap.get(payload.intentId)
      if (!intent)
        return
      intent.cancel(payload.reason)
      remoteIntentMap.delete(payload.intentId)
    })
  }

  function createRemoteIntent(options?: IntentOptions): IntentHandle {
    const intentId = options?.intentId ?? createId('intent')
    const streamId = options?.streamId ?? createId('stream')
    const priority = typeof options?.priority === 'number' ? options?.priority : undefined
    const behavior = options?.behavior
    const ownerId = options?.ownerId

    const { stream, write, close } = createPushStream<TextToken>()
    let sequence = 0
    let closed = false

    context.emit(speechIntentStartEvent, {
      originId,
      intentId,
      streamId,
      ownerId,
      priority,
      behavior,
    })

    console.log('[Speech Runtime] Creating intent', { intentId, ownerId, behavior, streamId })
    const handle: IntentHandle = {
      intentId,
      streamId,
      ownerId,
      priority: priority ?? 0,
      stream,
      writeLiteral(value: string) {
        if (closed)
          return
        console.log('[Speech Intent] writeLiteral', { intentId, streamId, value: value.slice(0, 120) })
        write({ type: 'literal', value, streamId, intentId, sequence, createdAt: Date.now() })
        context.emit(speechIntentLiteralEvent, {
          originId,
          intentId,
          streamId,
          sequence: sequence++,
          value,
        })
      },
      writeSpecial(value: string) {
        if (closed)
          return
        console.log('[Speech Intent] writeSpecial', { intentId, streamId, value })
        write({ type: 'special', value, streamId, intentId, sequence, createdAt: Date.now() })
        context.emit(speechIntentSpecialEvent, {
          originId,
          intentId,
          streamId,
          sequence: sequence++,
          value,
        })
      },
      writeFlush() {
        if (closed)
          return
        console.log('[Speech Intent] writeFlush', { intentId, streamId })
        write({ type: 'flush', streamId, intentId, sequence, createdAt: Date.now() })
        context.emit(speechIntentFlushEvent, {
          originId,
          intentId,
          streamId,
          sequence: sequence++,
        })
      },
      end() {
        if (closed)
          return
        closed = true
        close()
        console.log('[Speech Intent] end', { intentId, streamId })
        context.emit(speechIntentEndEvent, {
          originId,
          intentId,
          streamId,
        })
      },
      cancel(reason?: string) {
        if (closed)
          return
        closed = true
        close()
        console.log('[Speech Intent] cancel', { intentId, streamId, reason })
        context.emit(speechIntentCancelEvent, {
          originId,
          intentId,
          streamId,
          reason,
        })
      },
    }

    return handle
  }

  async function registerHost(pipeline: ReturnType<typeof createSpeechPipeline<AudioBuffer>>) {
    await mutex.acquire()
    try {
      if (hostPipeline && hostPipeline !== pipeline) {
        console.log('[Speech Runtime] Replacing stale host pipeline')
        remoteIntentMap.clear()
      }

      hostPipeline = pipeline
      hostReady = true
      bindSpeechBusToHost()
    }
    finally {
      mutex.release()
    }
  }

  async function unregisterHost(pipeline?: ReturnType<typeof createSpeechPipeline<AudioBuffer>>) {
    await mutex.acquire()
    try {
      if (!hostPipeline)
        return

      if (pipeline && hostPipeline !== pipeline)
        return

      console.log('[Speech Runtime] Unregistering host pipeline')
      hostPipeline = null
      hostReady = false
      remoteIntentMap.clear()
    }
    finally {
      mutex.release()
    }
  }

  function openIntent(options?: IntentOptions) {
    console.log('[Speech Runtime] openIntent called', { options })
    if (hostPipeline)
      return hostPipeline.openIntent(options)

    return createRemoteIntent(options)
  }

  function isHost() {
    return hostReady && !!hostPipeline
  }

  async function dispose() {
    await unregisterHost()
  }

  return {
    openIntent,
    registerHost,
    unregisterHost,
    isHost,
    dispose,
  }
}
