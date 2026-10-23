import type { ChatStreamEventContext } from '@proj-airi/core-agent'

import { defineInvokeHandler } from '@moeru/eventa'
import { createChatHooks } from '@proj-airi/core-agent'
import { afterEach, expect, it } from 'vitest'

import { getSpeechBusContext, holdLocalSpeechHost, voiceSpeechCommand } from './bus'
import { connectReplySpeechRelay } from './reply-relay'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(stop => stop()))

function replyContext(overrides: Partial<ChatStreamEventContext> = {}): ChatStreamEventContext {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    message: { role: 'user', content: 'Hello' },
    contexts: {},
    composedMessage: [],
    speaks: true,
    ...overrides,
  }
}

/** Records the commands that a speech host in another window receives. */
function startRemoteHost() {
  const commands: string[] = []
  cleanups.push(defineInvokeHandler(getSpeechBusContext(), voiceSpeechCommand, (command) => {
    commands.push(command.type === 'text' || command.type === 'special' ? `${command.type}:${command.value}` : command.type)
    return { status: 'accepted' }
  }))
  return commands
}

async function runReply(hooks: ReturnType<typeof createChatHooks>, context = replyContext()) {
  await hooks.emitBeforeMessageComposedHooks('Hello', context)
  await hooks.emitTokenLiteralHooks('Hi there.', context)
  await hooks.emitTokenSpecialHooks('<|ACT:happy|>', context)
  await hooks.emitStreamEndHooks(context)
}

// ROOT CAUSE:
//
// Browser tabs elect any tab as the chat leader, and replies run in the leader. Only a tab with the Stage spoke
// replies, through hooks that the Stage registers in its own tab. A settings tab that opened first ran every reply
// without a speech host, so replies were silent.
//
// We fixed this by relaying the reply text from a leader without a host to the host in another tab.
it('speaks a reply through the host of another window', async () => {
  const commands = startRemoteHost()
  const hooks = createChatHooks()
  cleanups.push(connectReplySpeechRelay(hooks, () => true))

  await runReply(hooks)

  await expect.poll(() => commands).toEqual(['open', 'text:Hi there.', 'special:<|ACT:happy|>', 'finish'])
})

it('stays idle when this window has its own host', async () => {
  const commands = startRemoteHost()
  const hooks = createChatHooks()
  cleanups.push(connectReplySpeechRelay(hooks, () => true))
  cleanups.push(holdLocalSpeechHost())

  await runReply(hooks)
  await new Promise(resolve => setTimeout(resolve, 20))

  expect(commands).toEqual([])
})

it('stays idle for a reply that does not speak, and without a host', async () => {
  const commands = startRemoteHost()
  const hooks = createChatHooks()
  let connected = true
  cleanups.push(connectReplySpeechRelay(hooks, () => connected))

  await runReply(hooks, replyContext({ speaks: false }))
  connected = false
  await runReply(hooks, replyContext({ turnId: 'turn-2' }))
  await new Promise(resolve => setTimeout(resolve, 20))

  expect(commands).toEqual([])
})
