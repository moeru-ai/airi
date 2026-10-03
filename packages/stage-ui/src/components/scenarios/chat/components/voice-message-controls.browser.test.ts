import type { VoiceInputCommand, VoiceMessageCommand } from '../../../../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import VoiceMessageControls from './voice-message-controls.vue'

import { getSpeechBusContext, voiceInputCommand, voiceMessageCommand, voiceRequestSnapshot, voiceSnapshotChanged } from '../../../../services/speech/bus'
import { useChatSessionStore } from '../../../../stores/chat/session-store'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

async function mountControls() {
  const commands: Array<VoiceInputCommand | VoiceMessageCommand> = []
  const context = getSpeechBusContext()
  cleanups.push(context.on(voiceRequestSnapshot, () => context.emit(voiceSnapshotChanged, { connected: true, drafts: [] })))
  cleanups.push(defineInvokeHandler(context, voiceInputCommand, (command) => {
    commands.push(command)
    return { status: 'accepted' }
  }))
  cleanups.push(defineInvokeHandler(context, voiceMessageCommand, (command) => {
    commands.push(command)
    return { status: 'accepted' }
  }))
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const component = defineComponent({ setup() {
    useChatSessionStore().activeSessionId = 'alice'
    return () => h(VoiceMessageControls)
  } })
  const screen = await render(component, { global: { plugins: [pinia, createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: { stage: { chat: { 'voice-message': { title: 'Voice controls', record: 'Record audio', finish: 'Finish recording', dictate: 'Hold to speak', starting: 'Starting', recording: 'Recording' } } } } },
  })] } })
  cleanups.push(() => screen.unmount())
  return { screen, commands, sessions: useChatSessionStore(pinia) }
}

it('finishes an attachment with its original identity after the selected chat changes', async () => {
  const { screen, commands, sessions } = await mountControls()
  await userEvent.click(screen.getByRole('button', { name: 'Record audio' }))
  await expect.poll(() => commands.length).toBe(1)
  const recording = commands[0]
  expect(recording).toMatchObject({ type: 'record', sessionId: 'alice' })
  if (recording?.type !== 'record')
    throw new Error('Expected recording command')
  sessions.activeSessionId = 'bob'
  await userEvent.click(screen.getByRole('button', { name: 'Finish recording' }))
  await expect.poll(() => commands.at(-1)).toEqual({ type: 'finish', id: recording.id })
})

it('ends keyboard push-to-talk using the original input request', async () => {
  const { screen, commands } = await mountControls()
  const button = screen.getByRole('button', { name: 'Hold to speak' })
  await userEvent.tab()
  await userEvent.tab()
  await expect.element(button).toHaveFocus()
  await userEvent.keyboard('{Enter>}')
  await expect.poll(() => commands.length).toBe(1)
  const input = commands[0]
  expect(input).toMatchObject({ type: 'begin', sessionId: 'alice' })
  if (input?.type !== 'begin')
    throw new Error('Expected input command')
  await userEvent.keyboard('{/Enter}')
  await expect.poll(() => commands.at(-1)).toEqual({ type: 'end', requestId: input.requestId })
})
