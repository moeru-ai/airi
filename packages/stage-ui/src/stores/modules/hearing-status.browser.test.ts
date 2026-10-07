import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import HearingStatus from '../../components/scenarios/status/hearing-status.vue'

import { getSpeechBusContext, voiceSnapshotChanged } from '../../services/speech/bus'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  localStorage.clear()
})

it('shows final transcription work and reports a provider failure through the host snapshot', async () => {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const view = render(HearingStatus, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  const context = getSpeechBusContext()
  context.emit(voiceSnapshotChanged, { connected: true, drafts: [], input: { requestId: 'recording', sessionId: 'alice', phase: 'finalizing', text: 'recognized words' } })
  await expect.element(view.getByRole('status')).toHaveTextContent('Transcribing')
  context.emit(voiceSnapshotChanged, { connected: true, drafts: [], error: 'Provider timed out', input: { requestId: 'recording', sessionId: 'alice', phase: 'settled', text: 'recognized words' } })
  await expect.element(view.getByRole('status')).toHaveTextContent('Could not transcribe audio')
})
