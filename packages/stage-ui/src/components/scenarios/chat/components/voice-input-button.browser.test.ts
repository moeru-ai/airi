import type { VoiceMessageSnapshot } from '../../../../libs/voice/voice-message'
import type { VoiceHostSnapshot, VoiceInputCommand, VoiceMessageCommand } from '../../../../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'
import { Toaster } from 'vue-sonner'

import VoiceInputButton from './voice-input-button.vue'

import { pushToTalkTriggerKey } from '../../../../composables/push-to-talk-trigger'
import { getSpeechBusContext, voiceInputCommand, voiceLevelMonitor, voiceMessageCommand, voiceMessagesChanged, voiceRequestSnapshot, voiceSnapshotChanged } from '../../../../services/speech/bus'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

/** Mounts the button against a scripted voice host. `afterFinish` is the message state the host reports after `finish`. */
async function mountButton(options: { afterFinish?: Partial<VoiceMessageSnapshot>, dictation?: string, queued?: boolean, pushToTalkTrigger?: boolean } = {}) {
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
  const attachment = document.body.appendChild(document.createElement('div'))
  cleanups.push(() => status.remove(), () => attachment.remove())
  const button = shallowRef<{ sendPending: (text: string) => Promise<'none' | 'sent' | 'failed'> }>()
  // The Toaster shows the toasts that the button raises, as the app root does.
  const component = defineComponent({ setup() {
    return () => [h(Toaster), h(VoiceInputButton, {
      'modelValue': draft.value,
      'onUpdate:modelValue': (value: string) => draft.value = value,
      'ref': button,
      'statusElement': status,
      'attachmentElement': attachment,
      'sessionId': 'alice',
      'onSubmit': () => submitted.push(true),
    })]
  } })
  const screen = await render(component, {
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })],
      provide: options.pushToTalkTrigger === undefined ? {} : { [pushToTalkTriggerKey as symbol]: options.pushToTalkTrigger },
    },
  })
  cleanups.push(() => screen.unmount())
  return { screen, commands, draft, submitted, button }
}

describe('voiceInputButton', () => {
  // Review: https://github.com/moeru-ai/airi/pull/2729#discussion_r4239147482
  it('warns in the menu when the saved mode is Push to Talk and the host has no trigger', async () => {
    localStorage.setItem('settings/hearing/input-mode', 'push-to-talk')
    const { screen } = await mountButton()

    await screen.getByTestId('voice-input-button').click({ button: 'right' })

    await expect.element(screen.getByTestId('voice-menu-push-to-talk-stranded')).toBeVisible()
    await expect.element(screen.getByTestId('voice-menu-push-to-talk-stranded')).toHaveTextContent('stage.chat.voice-composer.push-to-talk-unavailable')
  })

  // A hover opens the menu. Users saw the system microphone indicator turn on while microphone input was off,
  // because the menu asked the host for a level, and the host opened the microphone for it.
  it('asks the host for no level while microphone input is off', async () => {
    const monitorRequests: unknown[] = []
    cleanups.push(getSpeechBusContext().on(voiceLevelMonitor, ({ body }) => monitorRequests.push(body)))
    const { screen } = await mountButton()

    await screen.getByTestId('voice-input-button').click({ button: 'right' })
    await expect.element(screen.getByTestId('voice-menu-device')).toBeVisible()
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(monitorRequests).toEqual([])
    expect(screen.getByTestId('voice-menu-level').query()).toBeNull()
  })

  it('shows the level while microphone input holds the microphone open', async () => {
    localStorage.setItem('settings/audio/input/enabled', 'true')
    const monitorRequests: unknown[] = []
    cleanups.push(getSpeechBusContext().on(voiceLevelMonitor, ({ body }) => monitorRequests.push(body)))
    const { screen } = await mountButton()

    await screen.getByTestId('voice-input-button').click({ button: 'right' })

    await expect.element(screen.getByTestId('voice-menu-level')).toBeInTheDocument()
    await expect.poll(() => monitorRequests.length).toBeGreaterThan(0)
  })

  it('starts no recording while the microphone is off', async () => {
    localStorage.setItem('settings/audio/input/off', 'true')
    const { screen, commands } = await mountButton()
    const button = screen.getByTestId('voice-input-button')
    await expect.element(button).toHaveAccessibleName('stage.chat.voice-composer.microphone-off')

    await button.click()

    await expect.element(screen.getByText('stage.chat.voice-composer.microphone-off-description')).toBeVisible()
    expect(commands).toEqual([])
    await expect.element(button).toHaveAttribute('aria-pressed', 'false')
  })

  // The microphone switch and a capture lease finish a recording on the host. The control stayed on its spinner.
  it('frees the control and keeps the recording when the host finishes it', async () => {
    const { screen, commands } = await mountButton()
    const button = screen.getByTestId('voice-input-button')
    await button.click()
    await expect.element(screen.getByTestId('voice-status-bar')).toBeInTheDocument()
    const record = commands[0] as Extract<VoiceMessageCommand, { type: 'record' }>

    getSpeechBusContext().emit(voiceMessagesChanged, [{ id: record.id, sessionId: 'alice', phase: 'ready', audio: new Blob(['wav'], { type: 'audio/wav' }) }])

    await expect.element(button).toHaveAttribute('aria-pressed', 'false')
    await expect.element(screen.getByTestId('voice-status-bar')).not.toBeInTheDocument()
    expect(commands).toHaveLength(1)
  })

  it('turns the microphone off and on from the menu', async () => {
    const { screen } = await mountButton()
    await screen.getByTestId('voice-input-button').click({ button: 'right' })
    const microphone = screen.getByTestId('voice-menu-microphone')
    await expect.element(microphone).toHaveAttribute('aria-checked', 'true')

    await microphone.click()

    await expect.element(microphone).toHaveAttribute('aria-checked', 'false')
    expect(localStorage.getItem('settings/audio/input/off')).toBe('true')
    await expect.element(screen.getByTestId('voice-menu-listen')).toHaveAttribute('data-disabled')

    await microphone.click()

    await expect.element(microphone).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem('settings/audio/input/off')).toBe('false')
  })

  it('shows no Push to Talk warning in the menu when the host has a trigger', async () => {
    localStorage.setItem('settings/hearing/input-mode', 'push-to-talk')
    const { screen } = await mountButton({ pushToTalkTrigger: true })

    await screen.getByTestId('voice-input-button').click({ button: 'right' })

    await expect.element(screen.getByTestId('voice-menu-listen')).toBeVisible()
    expect(screen.getByTestId('voice-menu-push-to-talk-stranded').query()).toBeNull()
  })

  it('keeps a voice message pending when Auto send is off, and sends it with the composer text', async () => {
    const { screen, commands, button } = await mountButton()
    const control = screen.getByTestId('voice-input-button')
    await expect.element(control).toBeEnabled()

    await control.click()
    await expect.element(screen.getByTestId('voice-status-bar')).toHaveAttribute('data-phase', 'recording')
    await control.click()

    const record = commands[0] as Extract<VoiceMessageCommand, { type: 'record' }>
    await expect.poll(() => commands[1]).toEqual({ type: 'finish', id: record.id, send: false })
    await expect.element(screen.getByTestId('voice-pending-card')).toBeVisible()
    expect(await button.value?.sendPending('see the attached clip')).toBe('sent')
    await expect.poll(() => commands.at(-1)).toEqual({ type: 'send', id: record.id, text: 'see the attached clip' })
    await expect.element(screen.getByTestId('voice-pending-card')).not.toBeInTheDocument()
  })

  it('sends the voice message when the recording stops with Auto send on', async () => {
    localStorage.setItem('settings/hearing/auto-send-enabled', 'true')
    const { screen, commands } = await mountButton()
    const button = screen.getByTestId('voice-input-button')
    await button.click()
    await expect.element(screen.getByTestId('voice-status-bar')).toBeInTheDocument()
    await button.click()

    await expect.poll(() => commands[1]).toMatchObject({ type: 'finish', send: true })
    await expect.element(screen.getByTestId('voice-pending-card')).not.toBeInTheDocument()
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
