import type { LlmStreamingControlDispatchContext, LlmStreamingControlDispatchEvent } from '@proj-airi/pipelines-audio'

import { errorMessageFrom } from '@moeru/std'
import { createStreamingControlParser } from '@proj-airi/pipelines-audio'
import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { activeTurnSpan, startSpan } from '../../../composables/use-io-tracer'

interface RemoteCallMessage {
  callName: string
  fromInstanceId: string
  payload?: Record<string, unknown>
  turnId: string
  type: 'turn-call'
}

export const useLlmStreamingControlStore = defineStore('llm-streaming-control', () => {
  const controller = createStreamingControlParser()
  const instanceId = `streaming-control-${nanoid()}`

  const { data: incomingRemoteCall, post: postRemoteCall } = useBroadcastChannel<RemoteCallMessage, RemoteCallMessage>({ name: 'airi-streaming-control-turn-calls' })

  const tooltipKeys = [
    'token_type',
    'call_name',
    'parameter',
    'handler_count',
    'turn_id',
    'reason',
    'raw_token',
  ]

  watch(incomingRemoteCall, (message) => {
    if (!message || message.type !== 'turn-call')
      return
    if (message.fromInstanceId === instanceId)
      return

    const callPayload = message.payload === undefined
      ? [message.callName]
      : [message.callName, message.payload]
    void dispatchWith(`<|CALL ${JSON.stringify(callPayload)}|>`, {
      remote: true,
      turnId: message.turnId,
    })
  })

  async function dispatchWith(special: string, context?: Partial<LlmStreamingControlDispatchContext>) {
    const span = startSpan(IOSpanNames.StreamingControlDispatch, activeTurnSpan.value, {
      [IOAttributes.StreamingControlMatched]: false,
      [IOAttributes.StreamingControlParsed]: false,
      [IOAttributes.StreamingControlTokenLength]: special.length,
      [IOAttributes.Subsystem]: IOSubsystems.StreamingControl,
      ...(context?.turnId ? { [IOAttributes.StreamingControlTurnId]: context.turnId } : {}),
    })
    span.setAttribute(IOAttributes.TooltipKeys, tooltipKeys)

    function observe(event: LlmStreamingControlDispatchEvent) {
      switch (event.type) {
        case 'call-handler-count':
          span.setAttribute(IOAttributes.StreamingControlHandlerCount, event.count)
          break
        case 'call-handler-end':
          span.addEvent(IOEvents.StreamingControlHandlerEnd, {
            [IOAttributes.StreamingControlCallName]: event.callName,
          })
          break
        case 'call-handler-error':
          span.addEvent(IOEvents.StreamingControlHandlerError, {
            [IOAttributes.StreamingControlCallName]: event.callName,
            [IOAttributes.StreamingControlReason]: errorMessageFrom(event.error) ?? 'Unknown error',
          })
          break
        case 'call-handler-missing':
          if (context?.turnId && !context.remote) {
            postRemoteCall({
              callName: event.callName,
              fromInstanceId: instanceId,
              turnId: context.turnId,
              type: 'turn-call',
              ...(event.payload ? { payload: event.payload } : {}),
            })
          }
          break
        case 'call-handler-start':
          span.addEvent(IOEvents.StreamingControlHandlerStart, {
            [IOAttributes.StreamingControlCallName]: event.callName,
          })
          break
        case 'parsed':
          span.setAttribute(IOAttributes.StreamingControlMatched, true)
          span.setAttribute(IOAttributes.StreamingControlParsed, true)
          span.setAttribute(IOAttributes.StreamingControlParserName, event.parserName)
          span.setAttribute(IOAttributes.StreamingControlTokenType, event.tokenType)
          if (event.callName)
            span.setAttribute(IOAttributes.StreamingControlCallName, event.callName)
          if (event.parameter)
            span.setAttribute(IOAttributes.StreamingControlParameter, event.parameter)
          span.addEvent(IOEvents.StreamingControlParsed, {
            [IOAttributes.StreamingControlTokenType]: event.tokenType,
            ...(event.parameter ? { [IOAttributes.StreamingControlParameter]: event.parameter } : {}),
          })
          break
        case 'rejected':
          span.setAttribute(IOAttributes.StreamingControlReason, event.reason)
          span.setAttribute(IOAttributes.StreamingControlRawToken, special)
          if (event.parserName) {
            span.setAttribute(IOAttributes.StreamingControlMatched, true)
            span.setAttribute(IOAttributes.StreamingControlParserName, event.parserName)
          }
          span.addEvent(IOEvents.StreamingControlRejected, {
            [IOAttributes.StreamingControlRawToken]: special,
            [IOAttributes.StreamingControlReason]: event.reason,
          })
          break
        case 'signal-handler-error':
          span.addEvent(IOEvents.StreamingControlSignalHandlerError, {
            [IOAttributes.StreamingControlReason]: errorMessageFrom(event.error) ?? 'Unknown error',
            [IOAttributes.StreamingControlTokenType]: event.tokenType,
          })
          break
      }
    }

    try {
      return await controller.dispatchWith(special, {
        ...context,
        observer: observe,
      })
    }
    finally {
      span.end()
    }
  }

  return {
    beginTurn: controller.beginTurn,
    cancelTurn: controller.cancelTurn,
    completeTurn: controller.completeTurn,
    dispatchWith,
    match: controller.match,
    on: controller.on,
    onSignal: controller.onSignal,
    renderManifestPrompt: controller.renderManifestPrompt,
  }
})
