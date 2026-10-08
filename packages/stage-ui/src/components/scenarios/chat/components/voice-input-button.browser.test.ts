import type { VoiceMessageSnapshot } from '../../../../libs/voice/voice-message'
import type { VoiceHostSnapshot, VoiceInputCommand, VoiceMessageCommand } from '../../../../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import VoiceInputButton from './voice-input-button.vue'

import { getSpeechBusContext, voiceInputCommand, voiceMessageCommand, voiceMessagesChanged, voiceRequestSnapshot, voiceSnapshotChanged } from '../../../../services/speech/bus'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

/** Mounts the button against a scripted voice host. `afterFinish` is the message state the host reports after `finish`. */
async function mountButton(options: { afterFinish?: Partial<VoiceMessageSnapshot>, dictation?: string, queued?: boolean } = {}) {
  const commands: Array<VoiceInputCommand | VoiceMessageCommand> = []
  const context = getSpeechBusContext()
  const connected: VoiceHostSnapshot = { connected: true, drafts: [] }
  cleanups.push(context.on(voiceRequestSnapshot, () => context.emit(voiceSnapshotChanged, connected)))
  cleanups.push(defineInvokeHandler(context, voiceMessageCommand, (command) => {
    commands.push(command)
    if (command.type === 'record')
      context.emit(voiceMessagesChanged, [{ id: command.id, sessionId: command.sessionId, phase: 'capturing' }])
    if (command.type === 'finish' && command.send)
      context.emit(voiceMessagesChanged, options.queued ? [{ id: command.id, sessionId: 'alice', phase: 'sending' }] : [])
    else if (command.type === 'finish')
      context.emit(voiceMessagesChanged, [{ id: command.id, sessionId: 'alice', phase: 'ready', audio: new Blob(['wav'], { type: 'audio/wav' }), ...options.afterFinish }])
    if (command.type === 'discard' || command.type === 'send')
      context.emit(voiceMessagesChanged, [])
    return { status: 'accepted' }
  }))
  cleanups.push(defineInvokeHandler(context, voiceInputCommand, (command) => {
    commands.push(command)
    if (command.type === 'begin')
      context.emit(voiceSnapshotChanged, { ...connected, input: { requestId: command.requestId, sessionId: command.sessionId, phase: 'capturing', text: 'how are', segments: [] } })
    if (command.type === 'end')
      return { status: 'accepted', text: options.dictation }
    return { status: 'accepted' }
  }))

  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const draft = ref('Hello')
  const submitted: unknown[] = []
  const status = document.body.appendChild(document.createElement('div'))
  cleanups.push(() => status.remove())
  const component = defineComponent({ setup() {
    return () => h(VoiceInputButton, {
      'modelValue': draft.value,
      'onUpdate:modelValue': (value: string) => draft.value = value,
      'statusElement': status,
      'sessionId': 'alice',
      'onSubmit': () => submitted.push(true),
    })
  } })
  const screen = await render(component, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
  cleanups.push(() => screen.unmount())
  return { screen, commands, draft, submitted }
}

describe('voiceInputButton', () => {
  it('keeps a voice message pending when Auto send is off, and sends it from the status bar', async () => {
    const { screen, commands } = await mountButton()
    const button = screen.getByTestId('voice-input-button')
    await expect.element(button).toBeEnabled()

    await button.click()
    await expect.element(screen.getByTestId('voice-status-bar')).toHaveAttribute('data-phase', 'recording')
    await button.click()

    const record = commands[0] as Extract<VoiceMessageCommand, { type: 'record' }>
    await expect.poll(() => commands[1]).toEqual({ type: 'finish', id: record.id, send: false })
    await screen.getByTestId('voice-pending-send').click()
    await expect.poll(() => commands.at(-1)).toEqual({ type: 'send', id: record.id })
  })

  it('sends the voice message when the recording stops with Auto send on', async () => {
    localStorage.setItem('settings/hearing/auto-send-enabled', 'true')
    const { screen, commands } = await mountButton()
    const button = screen.getByTestId('voice-input-button')
    await button.click()
    await expect.element(screen.getByTestId('voice-status-bar')).toBeInTheDocument()
    await button.click()

    await expect.poll(() => commands[1]).toMatchObject({ type: 'finish', send: true })
    await expect.element(screen.getByTestId('voice-pending-bar')).not.toBeInTheDocument()
  })

  it('hides the cancel button when Auto send is off, because stopping does not send', async () => {
    const { screen } = await mountButton()
    await screen.getByTestId('voice-input-button').click()
    await expect.element(screen.getByTestId('voice-status-bar')).toBeInTheDocument()

    expect(screen.getByTestId('voice-status-cancel').query()).toBeNull()
  })

  // The chat queues a voice message behind a running reply. The control used to spin until that reply ended.
  it('frees the control while a sent voice message waits in the chat queue', async () => {
    localStorage.setItem('settings/hearing/auto-send-enabled', 'true')
    const { screen } = await mountButton({ queued: true })
    const button = screen.getByTestId('voice-input-button')
    await button.click()
    await expect.element(screen.getByTestId('voice-status-bar')).toBeInTheDocument()
    await button.click()

    await expect.element(screen.getByTestId('voice-status-bar')).not.toBeInTheDocument()
    await expect.element(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('cancels from the status bar without sending when Auto send is on', async () => {
    localStorage.setItem('settings/hearing/auto-send-enabled', 'true')
    const { screen, commands } = await mountButton()
    await screen.getByTestId('voice-input-button').click()
    await screen.getByTestId('voice-status-cancel').click()

    const record = commands[0] as Extract<VoiceMessageCommand, { type: 'record' }>
    await expect.poll(() => commands[1]).toEqual({ type: 'discard', id: record.id })
    await expect.element(screen.getByTestId('voice-status-bar')).not.toBeInTheDocument()
  })

  it('writes the live transcript into the composer and keeps the final text', async () => {
    localStorage.setItem('ui/chat/voice-mode', 'transcription')
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    const { screen, commands, draft, submitted } = await mountButton({ dictation: 'how are you' })
    const button = screen.getByTestId('voice-input-button')
    await button.click()

    await expect.poll(() => commands[0]).toMatchObject({ type: 'begin', target: 'composer' })
    await expect.poll(() => draft.value).toBe('Hello how are')
    await button.click()

    await expect.poll(() => draft.value).toBe('Hello how are you')
    expect(submitted).toEqual([])
  })
})
