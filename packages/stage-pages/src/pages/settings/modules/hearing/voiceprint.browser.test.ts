import type { VoiceEnrollmentCommand, VoiceEnrollmentState } from '@proj-airi/stage-ui/services/speech/bus'

import en from '@proj-airi/i18n/locales/en'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
import { toStoredVoiceprint } from '@proj-airi/stage-ui/libs/voice/voiceprint'
import { voiceEnrollmentChanged, voiceEnrollmentCommand, voiceRequestEnrollment, voiceRequestSnapshot, voiceSnapshotChanged } from '@proj-airi/stage-ui/services/speech/bus'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VoiceprintPage from './voiceprint.vue'

import 'virtual:uno.css'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanup()
  cleanups.splice(0).forEach(stop => stop())
  localStorage.clear()
})

function renderPage() {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  return render(VoiceprintPage, {
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })],
    },
  })
}

/**
 * A voice host in another window. It answers through its own BroadcastChannel, because a channel does not
 * receive its own messages. It records the enrollment commands and publishes the enrollment state that a test sets.
 */
function createHost() {
  const channel = new BroadcastChannel('proj-airi:pipelines:outputs:speech')
  const { context } = createBroadcastChannelContext(channel)
  const commands = vi.fn<(command: VoiceEnrollmentCommand) => void>()
  let state: VoiceEnrollmentState = { phase: 'idle' }
  const snapshot = () => context.emit(voiceSnapshotChanged, { connected: true, drafts: [] })
  const enrollment = () => context.emit(voiceEnrollmentChanged, state)
  const stops = [
    context.on(voiceRequestSnapshot, snapshot),
    context.on(voiceRequestEnrollment, enrollment),
    defineInvokeHandler(context, voiceEnrollmentCommand, async (command) => {
      commands(command)
      return { status: 'accepted' }
    }),
  ]
  cleanups.push(() => {
    stops.forEach(stop => stop())
    channel.close()
  })

  return {
    commands,
    /** Publishes a connected host and its enrollment state. */
    publish(value: VoiceEnrollmentState) {
      state = value
      snapshot()
      enrollment()
    },
  }
}

describe('voiceprint settings', () => {
  it('shows the saved voiceprint and deletes it', async () => {
    localStorage.setItem('settings/voice/voiceprint', JSON.stringify(toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 11.6 }, Date.UTC(2026, 9, 14))))
    const screen = renderPage()

    await expect.element(screen.getByTestId('voiceprint-status')).toHaveAttribute('data-state', 'enrolled')
    await expect.element(screen.getByTestId('voiceprint-status')).toHaveTextContent('from 12 s of speech')
    await expect.element(screen.getByTestId('voiceprint-start')).toHaveTextContent('Enroll again')

    await screen.getByRole('button', { name: 'Delete voiceprint' }).click()
    await screen.getByRole('button', { name: 'Yes' }).click()

    await expect.element(screen.getByTestId('voiceprint-status')).toHaveAttribute('data-state', 'none')
    expect(localStorage.getItem('settings/voice/voiceprint')).toBeNull()
  })

  it('asks for a new enrollment when another model revision computed the voiceprint', async () => {
    const stored = toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now())
    localStorage.setItem('settings/voice/voiceprint', JSON.stringify({ ...stored, modelRevision: 'older-revision' }))
    const screen = renderPage()

    await expect.element(screen.getByTestId('voiceprint-status')).toHaveAttribute('data-state', 'outdated')
    await expect.element(screen.getByTestId('voiceprint-status')).toHaveTextContent('Enroll again to use your voiceprint')
  })

  it('controls the enrollment of a connected voice host', async () => {
    const host = createHost()
    const screen = renderPage()
    host.publish({ phase: 'idle' })

    await screen.getByTestId('voiceprint-start').click()

    await vi.waitFor(() => expect(host.commands).toHaveBeenLastCalledWith({ type: 'begin' }))

    host.publish({ phase: 'recording', speechSeconds: 2.4 })

    await expect.element(screen.getByTestId('voiceprint-progress')).toHaveTextContent('2.4 s of speech. Enrollment needs at least 5 s.')
    await expect.element(screen.getByTestId('voiceprint-finish')).toBeDisabled()

    host.publish({ phase: 'recording', speechSeconds: 6.1 })
    await expect.element(screen.getByTestId('voiceprint-finish')).toBeEnabled()
    await screen.getByTestId('voiceprint-finish').click()

    await vi.waitFor(() => expect(host.commands).toHaveBeenLastCalledWith({ type: 'finish' }))

    host.publish({ phase: 'failed', speechSeconds: 6.1, failure: 'error', error: 'Audio has more than one voice' })

    await expect.element(screen.getByTestId('voiceprint-result')).toHaveTextContent('Enrollment failed: Audio has more than one voice')
  })
})
