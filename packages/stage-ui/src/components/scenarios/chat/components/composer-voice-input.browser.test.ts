import type { VoiceHostSnapshot, VoiceInputCommand, VoiceMessageCommand } from '../../../../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ComposerVoiceInput from './composer-voice-input.vue'

import { getSpeechBusContext, voiceInputCommand, voiceMessageCommand, voiceMessagesChanged, voiceRequestSnapshot, voiceSnapshotChanged } from '../../../../services/speech/bus'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

/** Mounts the microphone in a positioned input surface, against a scripted voice host that dictates `dictation`. */
async function mountInput(options: { dictation?: string } = {}) {
  // Dictation and walkie-talkie need a transcription provider. Web Speech needs no model.
  localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
  const commands: Array<VoiceInputCommand | VoiceMessageCommand> = []
  const context = getSpeechBusContext()
  const connected: VoiceHostSnapshot = { connected: true, drafts: [] }
  cleanups.push(context.on(voiceRequestSnapshot, () => context.emit(voiceSnapshotChanged, connected)))
  cleanups.push(defineInvokeHandler(context, voiceMessageCommand, (command) => {
    commands.push(command)
    if (command.type === 'record')
      context.emit(voiceMessagesChanged, [{ id: command.id, sessionId: command.sessionId, phase: 'capturing' }])
    if (command.type === 'finish')
      context.emit(voiceMessagesChanged, [])
    return { status: 'accepted' }
  }))
  cleanups.push(defineInvokeHandler(context, voiceInputCommand, (command) => {
    commands.push(command)
    if (command.type === 'begin')
      context.emit(voiceSnapshotChanged, { ...connected, input: { requestId: command.requestId, sessionId: command.sessionId, phase: 'capturing', text: 'how are', segments: [] } })
    if (command.type === 'end' || command.type === 'cancel')
      context.emit(voiceSnapshotChanged, connected)
    if (command.type === 'end')
      return { status: 'accepted', text: options.dictation }
    return { status: 'accepted' }
  }))

  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const draft = ref('Hello')
  const submitted: unknown[] = []
  const covering: boolean[] = []
  const surface = ref<HTMLElement | null>(null)
  const attachment = document.body.appendChild(document.createElement('div'))
  cleanups.push(() => attachment.remove())
  const component = defineComponent({ setup() {
    // The surface sits beside the microphone, like the text area of a composer.
    return () => h('div', { style: 'display: flex; width: 360px; height: 40px' }, [
      h('div', { 'ref': surface, 'data-testid': 'surface', 'style': 'position: relative; flex: 1' }),
      h(ComposerVoiceInput, {
        'modelValue': draft.value,
        'onUpdate:modelValue': (value: string) => draft.value = value,
        'surface': surface.value,
        'attachmentElement': attachment,
        'sessionId': 'alice',
        'onSubmit': () => submitted.push(true),
        'onActiveChange': (value: boolean) => covering.push(value),
      }),
    ])
  } })
  const screen = await render(component, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] },
  })
  cleanups.push(() => screen.unmount())
  return { screen, commands, draft, submitted, covering }
}

describe('composerVoiceInput', () => {
  it('dictates by default, and a second tap puts the text into the composer', async () => {
    const { screen, commands, draft, submitted } = await mountInput({ dictation: 'how are you' })
    const microphone = screen.getByTestId('composer-voice-button')
    await expect.element(microphone).toHaveAttribute('data-mode', 'transcription')
    await expect.element(microphone).toBeEnabled()

    await microphone.click()
    await expect.poll(() => commands[0]).toMatchObject({ type: 'begin', target: 'composer', sessionId: 'alice' })
    await expect.element(screen.getByTestId('composer-voice-recording')).toHaveAttribute('data-phase', 'recording')
    // The live transcript shows on the voice presence card, not in the composer text.
    expect(draft.value).toBe('Hello')

    // The microphone is the red stop button while it records.
    await expect.element(microphone).toHaveAttribute('data-state', 'recording')
    await microphone.click()
    await expect.poll(() => draft.value).toBe('Hello how are you')
    await expect.element(screen.getByTestId('composer-voice-recording')).not.toBeInTheDocument()
    expect(submitted).toEqual([])
  })

  it('asks the host to send the dictated text with Auto send on', async () => {
    localStorage.setItem('settings/hearing/auto-send-enabled', 'true')
    const { screen, draft, submitted } = await mountInput({ dictation: 'how are you' })

    const microphone = screen.getByTestId('composer-voice-button')
    await microphone.click()
    await expect.element(microphone).toHaveAttribute('data-state', 'recording')
    await expect.element(microphone).toBeEnabled()
    await microphone.click()

    await expect.poll(() => submitted.length).toBe(1)
    expect(draft.value).toBe('Hello how are you')
  })

  it('discards the dictation and keeps the composer text on cancel', async () => {
    const { screen, commands, draft } = await mountInput({ dictation: 'how are you' })

    await screen.getByTestId('composer-voice-button').click()
    await expect.element(screen.getByTestId('composer-voice-cancel')).toBeVisible()
    await screen.getByTestId('composer-voice-cancel').click()

    await expect.poll(() => commands.at(-1)).toMatchObject({ type: 'cancel' })
    await expect.element(screen.getByTestId('composer-voice-recording')).not.toBeInTheDocument()
    expect(draft.value).toBe('Hello')
  })

  it('offers the input modes and Auto send in the menu, and remembers the chosen mode', async () => {
    const { screen } = await mountInput()

    await screen.getByTestId('composer-voice-button').click({ button: 'right' })
    await expect.element(screen.getByTestId('composer-voice-auto-send')).toBeVisible()
    await screen.getByTestId('composer-voice-mode-walkie').click()

    await expect.element(screen.getByTestId('composer-voice-button')).toHaveAttribute('data-mode', 'walkie')
    expect(localStorage.getItem('ui/chat/composer-voice-mode')).toBe('walkie')
  })

  it('opens the menu on a long press, and the press does not start a recording', async () => {
    const { screen, commands } = await mountInput()
    const microphone = screen.getByTestId('composer-voice-button')

    await expect.element(microphone).toBeEnabled()

    microphone.element().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, button: 0 }))
    await expect.element(screen.getByTestId('composer-voice-auto-send')).toBeVisible()
    microphone.element().dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, button: 0 }))

    expect(commands).toEqual([])
  })

  // Space on the focused bar takes the same hold path as a pointer, without pointer capture.
  it('turns the input into a hold-to-talk bar in walkie-talkie mode, and a release inserts the text', async () => {
    localStorage.setItem('ui/chat/composer-voice-mode', 'walkie')
    const { screen, commands, draft, covering } = await mountInput({ dictation: 'how are you' })

    await screen.getByTestId('composer-voice-button').click()
    const hold = screen.getByTestId('composer-voice-hold')
    await expect.element(hold).toBeVisible()
    expect(covering.at(-1)).toBe(true)

    ;(hold.element() as HTMLElement).focus()
    await userEvent.keyboard('{Space>}')
    await expect.poll(() => commands[0]).toMatchObject({ type: 'begin', target: 'composer' })
    await expect.element(hold).toHaveAttribute('data-holding', 'true')
    await userEvent.keyboard('{/Space}')

    await expect.poll(() => draft.value).toBe('Hello how are you')
    // Without Auto send the bar returns to the keyboard, so the text can be edited.
    await expect.element(screen.getByTestId('composer-voice-hold')).not.toBeInTheDocument()
    expect(covering.at(-1)).toBe(false)
  })

  it('returns from walkie-talkie mode to the keyboard', async () => {
    localStorage.setItem('ui/chat/composer-voice-mode', 'walkie')
    const { screen, commands } = await mountInput()

    const microphone = screen.getByTestId('composer-voice-button')
    await microphone.click()
    await expect.element(microphone).toHaveAttribute('data-state', 'walkie')
    // In walkie-talkie mode the microphone is the keyboard button.
    await microphone.click()

    await expect.element(screen.getByTestId('composer-voice-hold')).not.toBeInTheDocument()
    expect(commands.filter(command => command.type === 'begin')).toEqual([])
  })

  it('records a voice message in voice message mode', async () => {
    localStorage.setItem('ui/chat/composer-voice-mode', 'audio')
    const { screen, commands } = await mountInput()

    await screen.getByTestId('composer-voice-button').click()
    await expect.poll(() => commands[0]).toMatchObject({ type: 'record', sessionId: 'alice' })
    await expect.element(screen.getByTestId('composer-voice-recording')).toHaveAttribute('data-phase', 'recording')
  })
})
