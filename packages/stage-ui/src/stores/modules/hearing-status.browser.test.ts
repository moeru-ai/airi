import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import HearingStatus from '../../components/scenarios/status/hearing-status.vue'

import { getSpeechBusContext, voiceSnapshotChanged } from '../../services/speech/bus'
import { useHearingStore } from './hearing'

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
  context.emit(voiceSnapshotChanged, { connected: true, drafts: [], input: { requestId: 'recording', sessionId: 'alice', phase: 'finalizing', text: 'recognized words', segments: [{ id: 'speech-0', text: 'recognized words', final: true }] } })
  await expect.element(view.getByRole('status')).toHaveTextContent('Transcribing')
  context.emit(voiceSnapshotChanged, { connected: true, drafts: [], error: 'Provider timed out', input: { requestId: 'recording', sessionId: 'alice', phase: 'settled', text: 'recognized words', segments: [{ id: 'speech-0', text: 'recognized words', final: true }] } })
  await expect.element(view.getByRole('status')).toHaveTextContent('Could not transcribe audio')
  useHearingStore(pinia).enabled = false
  await expect.element(view.getByRole('status')).not.toBeInTheDocument()
})

it('shows only problems when the stage asks for issues only', async () => {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const plugins = [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })]
  const full = render(HearingStatus, { global: { plugins } })
  const issuesOnly = page.elementLocator(render(HearingStatus, { props: { issuesOnly: true }, global: { plugins } }).container)
  const context = getSpeechBusContext()
  context.emit(voiceSnapshotChanged, { connected: true, drafts: [], input: { requestId: 'recording', sessionId: 'alice', phase: 'finalizing', text: 'recognized words', segments: [{ id: 'speech-0', text: 'recognized words', final: true }] } })
  // The full capsule shows the same snapshot, so the issues-only one has received it.
  await expect.element(full.getByRole('status')).toHaveTextContent('Transcribing')
  expect(issuesOnly.getByRole('status').query()).toBeNull()
  context.emit(voiceSnapshotChanged, { connected: true, drafts: [], error: 'Provider timed out', input: { requestId: 'recording', sessionId: 'alice', phase: 'settled', text: 'recognized words', segments: [{ id: 'speech-0', text: 'recognized words', final: true }] } })
  await expect.element(issuesOnly.getByRole('status')).toHaveTextContent('Could not transcribe audio')
})
