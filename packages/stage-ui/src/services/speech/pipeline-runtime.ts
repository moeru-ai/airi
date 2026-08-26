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

export interface SpeechPipelineRuntime {
  dispose: () => Promise<void>
  isHost: () => boolean
  openIntent: (options?: IntentOptions) => IntentHandle
  registerHost: (pipeline: ReturnType<typeof createSpeechPipeline<AudioBuffer>>) => Promise<void>
}

export function createSpeechPipelineRuntime(): SpeechPipelineRuntime {
  const mutex = new Mutex()
  const originId = `speech-${nanoid()}`

  let hostPipeline: null | ReturnType<typeof createSpeechPipeline<AudioBuffer>> = null
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
        behavior: payload.behavior,
        intentId: payload.intentId,
        ownerId: payload.ownerId,
        priority: payload.priority,
        streamId: payload.streamId,
        turnId: payload.turnId,
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
        const fallback = hostPipeline.openIntent({ intentId: payload.intentId, streamId: payload.streamId, turnId: payload.turnId })
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
    const turnId = options?.turnId
    const streamId = options?.streamId ?? createId('stream')
    const priority = typeof options?.priority === 'number' ? options?.priority : undefined
    const behavior = options?.behavior
    const ownerId = options?.ownerId

    const { close, stream, write } = createPushStream<TextToken>()
    let sequence = 0
    let closed = false

    context.emit(speechIntentStartEvent, {
      behavior,
      intentId,
      originId,
      ownerId,
      priority,
      streamId,
      turnId,
    })

    const handle: IntentHandle = {
      cancel(reason?: string) {
        if (closed)
          return
        closed = true
        close()
        context.emit(speechIntentCancelEvent, {
          intentId,
          originId,
          reason,
          streamId,
          turnId,
        })
      },
      end() {
        if (closed)
          return
        closed = true
        close()
        context.emit(speechIntentEndEvent, {
          intentId,
          originId,
          streamId,
          turnId,
        })
      },
      intentId,
      ownerId,
      priority: priority ?? 0,
      stream,
      streamId,
      turnId,
      writeFlush() {
        if (closed)
          return
        write({ createdAt: Date.now(), intentId, sequence, streamId, turnId, type: 'flush' })
        context.emit(speechIntentFlushEvent, {
          intentId,
          originId,
          sequence: sequence++,
          streamId,
          turnId,
        })
      },
      writeLiteral(value: string) {
        if (closed)
          return
        write({ createdAt: Date.now(), intentId, sequence, streamId, turnId, type: 'literal', value })
        context.emit(speechIntentLiteralEvent, {
          intentId,
          originId,
          sequence: sequence++,
          streamId,
          turnId,
          value,
        })
      },
      writeSpecial(value: string) {
        if (closed)
          return
        write({ createdAt: Date.now(), intentId, sequence, streamId, turnId, type: 'special', value })
        context.emit(speechIntentSpecialEvent, {
          intentId,
          originId,
          sequence: sequence++,
          streamId,
          turnId,
          value,
        })
      },
    }

    return handle
  }

  async function registerHost(pipeline: ReturnType<typeof createSpeechPipeline<AudioBuffer>>) {
    await mutex.acquire()
    try {
      if (hostPipeline)
        return
      hostPipeline = pipeline
      hostReady = true
      bindSpeechBusToHost()
    }
    finally {
      mutex.release()
    }
  }

  function openIntent(options?: IntentOptions) {
    if (hostPipeline)
      return hostPipeline.openIntent(options)

    return createRemoteIntent(options)
  }

  function isHost() {
    return hostReady && !!hostPipeline
  }

  async function dispose() {
    await mutex.acquire()
    try {
      hostPipeline = null
      hostReady = false
      remoteIntentMap.clear()
    }
    finally {
      mutex.release()
    }
  }

  return {
    dispose,
    isHost,
    openIntent,
    registerHost,
  }
}

function createId(prefix: string) {
  return `${prefix}-${nanoid()}`
}
