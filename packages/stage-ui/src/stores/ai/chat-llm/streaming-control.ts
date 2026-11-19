import type { LlmStreamingControlDispatchContext, LlmStreamingControlDispatchEvent } from '@proj-airi/pipelines-audio'

import { errorMessageFrom } from '@moeru/std'
import { createStreamingControlParser } from '@proj-airi/pipelines-audio'
import { beginSpan, trackPath } from '@proj-airi/trace-kit'
import { AgentAttributes, AgentNames, AgentTracks } from '@proj-airi/trace-kit/agent'
import { VoiceIdKeys } from '@proj-airi/trace-kit/voice'
import { useBroadcastChannel } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { getTraceSink, LOCAL_AGENT_ACTOR } from '../../../composables/use-trace'

interface RemoteCallMessage {
  type: 'turn-call'
  fromInstanceId: string
  turnId: string
  callName: string
  payload?: Record<string, unknown>
}

export const useLlmStreamingControlStore = defineStore('llm-streaming-control', () => {
  const controller = createStreamingControlParser()
  const instanceId = `streaming-control-${nanoid()}`

  const { post: postRemoteCall, data: incomingRemoteCall } = useBroadcastChannel<RemoteCallMessage, RemoteCallMessage>({ name: 'airi-streaming-control-turn-calls' })

  watch(incomingRemoteCall, (message) => {
    if (!message || message.type !== 'turn-call')
      return
    if (message.fromInstanceId === instanceId)
      return

    const callPayload = message.payload === undefined
      ? [message.callName]
      : [message.callName, message.payload]
    void dispatchWith(`<|CALL ${JSON.stringify(callPayload)}|>`, {
      turnId: message.turnId,
      remote: true,
    })
  })

  async function dispatchWith(special: string, context?: Partial<LlmStreamingControlDispatchContext>) {
    // The span carries the turn ID, so the timeline joins it with the chat turn, also for a turn of another window.
    const span = beginSpan(getTraceSink(), {
      track: trackPath(AgentTracks.Control, { agent: LOCAL_AGENT_ACTOR }),
      name: AgentNames.ControlDispatch,
      ids: context?.turnId ? { [VoiceIdKeys.Turn]: context.turnId } : undefined,
      attrs: {
        [AgentAttributes.ControlMatched]: false,
        [AgentAttributes.ControlParsed]: false,
        [AgentAttributes.ControlTokenLength]: special.length,
      },
    })

    function observe(event: LlmStreamingControlDispatchEvent) {
      switch (event.type) {
        case 'rejected':
          span.update({
            [AgentAttributes.ControlReason]: event.reason,
            [AgentAttributes.ControlRawToken]: special,
            ...(event.parserName ? { [AgentAttributes.ControlMatched]: true, [AgentAttributes.ControlParserName]: event.parserName } : {}),
          })
          span.instant(AgentNames.ControlRejected, { [AgentAttributes.ControlReason]: event.reason })
          break
        case 'parsed':
          span.update({
            [AgentAttributes.ControlMatched]: true,
            [AgentAttributes.ControlParsed]: true,
            [AgentAttributes.ControlParserName]: event.parserName,
            [AgentAttributes.ControlTokenType]: event.tokenType,
            ...(event.callName ? { [AgentAttributes.ControlCallName]: event.callName } : {}),
            ...(event.parameter ? { [AgentAttributes.ControlParameter]: event.parameter } : {}),
          })
          span.instant(AgentNames.ControlParsed, { [AgentAttributes.ControlTokenType]: event.tokenType })
          break
        case 'call-handler-count':
          span.update({ [AgentAttributes.ControlHandlerCount]: event.count })
          break
        case 'call-handler-missing':
          if (context?.turnId && !context.remote) {
            postRemoteCall({
              type: 'turn-call',
              fromInstanceId: instanceId,
              turnId: context.turnId,
              callName: event.callName,
              ...(event.payload ? { payload: event.payload } : {}),
            })
          }
          break
        case 'call-handler-start':
          span.instant(AgentNames.ControlHandlerStarted, { [AgentAttributes.ControlCallName]: event.callName })
          break
        case 'call-handler-end':
          span.instant(AgentNames.ControlHandlerEnded, { [AgentAttributes.ControlCallName]: event.callName })
          break
        case 'call-handler-error':
          span.instant(AgentNames.ControlHandlerFailed, {
            [AgentAttributes.ControlCallName]: event.callName,
            [AgentAttributes.ControlReason]: errorMessageFrom(event.error) ?? 'Unknown error',
          })
          break
        case 'signal-handler-error':
          span.instant(AgentNames.ControlHandlerFailed, {
            [AgentAttributes.ControlReason]: errorMessageFrom(event.error) ?? 'Unknown error',
            [AgentAttributes.ControlTokenType]: event.tokenType,
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
    dispatchWith,
    beginTurn: controller.beginTurn,
    completeTurn: controller.completeTurn,
    cancelTurn: controller.cancelTurn,
    match: controller.match,
    on: controller.on,
    renderManifestPrompt: controller.renderManifestPrompt,
    onSignal: controller.onSignal,
  }
})
