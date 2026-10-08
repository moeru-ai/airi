import type { VoiceMessageSnapshot } from '../../../../libs/voice/voice-message'
import type { VoiceInputCommand, VoiceMessageCommand } from '../../../../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import VoiceComposer from './voice-composer.vue'

import { getSpeechBusContext, voiceInputCommand, voiceMessageCommand, voiceMessagesChanged, voiceRequestSnapshot, voiceSnapshotChanged } from '../../../../services/speech/bus'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

interface HostBehavior {
  /** Publishes capture after `record`, as a host does when the microphone delivers audio. @default true */
  captures?: boolean
  /** The message state after `finish`. Omission removes the message, as a successful send does. */
  afterFinish?: Partial<VoiceMessageSnapshot>
  /** The `end` result text of a composer dictation. */
  dictation?: string
}

/** Mounts the control against a scripted voice host on the shared speech bus. */
async function mountComposer(behavior: HostBehavior = {}) {
  const commands: Array<VoiceInputCommand | VoiceMessageCommand> = []
  const context = getSpeechBusContext()
  const connected = { connected: true, drafts: [] }
  cleanups.push(context.on(voiceRequestSnapshot, () => context.emit(voiceSnapshotChanged, connected)))
  cleanups.push(defineInvokeHandler(context, voiceMessageCommand, (command) => {
    commands.push(command)
    if (command.type === 'record' && behavior.captures !== false)
      context.emit(voiceMessagesChanged, [{ id: command.id, sessionId: command.sessionId, phase: 'capturing' }])
    if (command.type === 'finish')
      context.emit(voiceMessagesChanged, behavior.afterFinish ? [{ id: command.id, sessionId: 'alice', phase: 'ready', ...behavior.afterFinish }] : [])
    if (command.type === 'discard' || command.type === 'send')
      context.emit(voiceMessagesChanged, [])
    return { status: 'accepted' }
  }))
  cleanups.push(defineInvokeHandler(context, voiceInputCommand, (command) => {
    commands.push(command)
    if (command.type === 'begin')
      context.emit(voiceSnapshotChanged, { ...connected, input: { requestId: command.requestId, sessionId: command.sessionId, phase: 'capturing', text: '', segments: [] } })
    if (command.type === 'end')
      return { status: 'accepted', text: behavior.dictation }
    return { status: 'accepted' }
  }))

  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const draft = ref('Hello')
  const sent: unknown[] = []
  const component = defineComponent({ setup() {
    return () => h(VoiceComposer, {
      'modelValue': draft.value,
      'onUpdate:modelValue': (value: string) => draft.value = value,
      'inputElement': null,
      'sessionId': 'alice',
      'replyToMessageId': 'message-1',
      'onSent': () => sent.push(true),
    })
  } })
  const screen = await render(component, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
  cleanups.push(() => screen.unmount())
  return { screen, commands, draft, sent }
}

/** Enter starts a locked recording, and a second Enter finishes it. */
async function recordWithKeyboard(screen: Awaited<ReturnType<typeof mountComposer>>['screen']) {
  const button = screen.getByTestId('voice-composer-button')
  await expect.element(button).toBeEnabled()
  ;(button.element() as HTMLElement).focus()
  await userEvent.keyboard('{Enter}')
  return button
}

describe('voiceComposer', () => {
  it('sends a voice message with the reply target captured when recording started', async () => {
    const { screen, commands, sent } = await mountComposer()
    await recordWithKeyboard(screen)
    await expect.poll(() => commands[0]).toMatchObject({ type: 'record', sessionId: 'alice', replyToMessageId: 'message-1' })
    await expect.element(screen.getByTestId('voice-composer-overlay')).toHaveAttribute('data-phase', 'recording')

    await userEvent.keyboard('{Enter}')

    const record = commands[0] as Extract<VoiceMessageCommand, { type: 'record' }>
    await expect.poll(() => commands[1]).toEqual({ type: 'finish', id: record.id, send: true })
    await expect.poll(() => sent.length).toBe(1)
  })

  it('discards a recording that has not captured audio yet', async () => {
    const { screen, commands } = await mountComposer({ captures: false })
    await recordWithKeyboard(screen)
    await expect.poll(() => commands.length).toBe(1)

    await userEvent.keyboard('{Enter}')

    const record = commands[0] as Extract<VoiceMessageCommand, { type: 'record' }>
    await expect.poll(() => commands[1]).toEqual({ type: 'discard', id: record.id })
  })

  it('keeps a voice message that failed to send and sends it again on retry', async () => {
    const { screen, commands, sent } = await mountComposer({ afterFinish: { error: 'Provider unavailable' } })
    await recordWithKeyboard(screen)
    await expect.poll(() => commands.length).toBe(1)
    await userEvent.keyboard('{Enter}')

    const retry = screen.getByTestId('voice-retry-send')
    await expect.element(retry).toBeVisible()
    expect(sent).toEqual([])
    await retry.click()

    const record = commands[0] as Extract<VoiceMessageCommand, { type: 'record' }>
    await expect.poll(() => commands.at(-1)).toEqual({ type: 'send', id: record.id })
    await expect.poll(() => sent.length).toBe(1)
  })

  it('appends dictation to the composer text', async () => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    const { screen, commands, draft } = await mountComposer({ dictation: 'how are you' })
    const button = screen.getByTestId('voice-composer-button')
    await button.click()
    await expect.element(button).toHaveAttribute('aria-label', 'stage.chat.voice-composer.transcription')

    await recordWithKeyboard(screen)
    await expect.poll(() => commands[0]).toMatchObject({ type: 'begin', sessionId: 'alice', target: 'composer' })
    await userEvent.keyboard('{Enter}')

    const begin = commands[0] as Extract<VoiceInputCommand, { type: 'begin' }>
    await expect.poll(() => commands[1]).toEqual({ type: 'end', requestId: begin.requestId })
    await expect.poll(() => draft.value).toBe('Hello how are you')
  })
})
