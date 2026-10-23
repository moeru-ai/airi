import type { ChatHookRegistry, TurnRef } from '@proj-airi/core-agent'

import { turnKey } from '@proj-airi/core-agent'

import { hasLocalSpeechHost } from './bus'
import { SpeechClient } from './speech-client'

type ReplyHooks = Pick<ChatHookRegistry, 'onBeforeMessageComposed' | 'onTokenLiteral' | 'onTokenSpecial' | 'onStreamEnd' | 'onAssistantResponseEnd'>

/**
 * Speaks replies through the speech host of another window when this window runs the reply but has no host.
 *
 * Chat replies run in the synchronized leader. Only a window that mounts the Stage connects a speech output host, and
 * the Stage speaks the replies that run in its own window. In the browser, any tab can be the leader, for example a
 * settings tab that opened first. Without this relay, the replies of such a leader are silent.
 *
 * State model: one {@link SpeechClient} for each relayed turn, by turn key. A client opens before the message is
 * composed, and finishes at the end of the stream or of the response. The host also closes the turn when generation
 * ends, so a lost finish does not keep the turn open.
 *
 * A reply relays only when it speaks, this window has no local host, and `hostConnected` reports a host in another
 * window. Returns a function that removes the hooks and cancels open relays.
 */
export function connectReplySpeechRelay(hooks: ReplyHooks, hostConnected: () => boolean): () => void {
  const clients = new Map<string, SpeechClient>()

  const clientOf = (turn: TurnRef) => clients.get(turnKey(turn))

  function finish(turn: TurnRef) {
    const key = turnKey(turn)
    const client = clients.get(key)
    clients.delete(key)
    void client?.finish().catch(error => console.error('[reply-speech-relay] Failed to finish relayed speech:', error))
  }

  const stops = [
    hooks.onBeforeMessageComposed(async (_message, context) => {
      // Background work and scene replies never speak. A local host speaks for itself through the Stage hooks.
      if (!context.speaks || hasLocalSpeechHost() || !hostConnected())
        return
      const turn = { sessionId: context.sessionId, turnId: context.turnId }
      if (!clientOf(turn))
        clients.set(turnKey(turn), new SpeechClient(turn, 'answer'))
    }),
    hooks.onTokenLiteral(async (literal, context) => {
      await clientOf(context)?.write(literal)
    }),
    hooks.onTokenSpecial(async (special, context) => {
      await clientOf(context)?.special(special)
    }),
    hooks.onStreamEnd(async context => finish(context)),
    hooks.onAssistantResponseEnd(async (_message, context) => finish(context)),
  ]

  return () => {
    stops.forEach(stop => stop())
    for (const client of clients.values())
      void client.cancel('Reply speech relay stopped').catch(() => {})
    clients.clear()
  }
}
