import type { PiniaActionEvent } from '@proj-airi/stage-shared/types/pinia-action-event'
import type { AudioCapture } from '@proj-airi/vitest-plugin-fakemic'
import type { ElectronApplication, Page } from 'playwright'

import type { AudioInputChatMessage, AudioInputSession, AudioInputSpan, AudioInputTarget, AudioInputTurn } from '../types'

import { Buffer } from 'node:buffer'

import { piniaActionTracingChannelName } from '@proj-airi/stage-shared/types/pinia-action-event'
import { AgentAttributes, AgentNames } from '@proj-airi/trace-kit/agent'
import { VoiceAttributes, VoiceIdKeys, VoiceNames } from '@proj-airi/trace-kit/voice'

import { readTraceRecords } from './browser-probe'
import { completedSpansOf } from './trace-spans'

/** Creates the runtime session for one audio test. */
export function createSession(options: {
  electronApp?: ElectronApplication
  page: Page
  target: AudioInputTarget
  close: () => Promise<void>
  transcriptionCaptureFormat?: AudioCapture['format']
}): AudioInputSession {
  const session: AudioInputSession = {
    electronApp: options.electronApp,
    page: options.page,
    runtimePage: options.page,
    target: options.target,
    transcriptionCaptureFormat: options.transcriptionCaptureFormat,
    activatePage(page) {
      session.page = page
    },
    async capturedTranscriptionAudio(count) {
      try {
        await options.page.waitForFunction(expectedCount => (
          (window.__airiAudioInputE2E?.transcriptionAudio.length ?? 0) >= expectedCount
        ), count, { timeout: 60_000 })
      }
      catch (error) {
        const runtimeState = await options.page.evaluate(async () => ({
          activeModel: localStorage.getItem('settings/hearing/active-model'),
          activeProvider: localStorage.getItem('settings/hearing/active-provider'),
          devices: (await navigator.mediaDevices.enumerateDevices()).map(device => ({
            deviceId: device.deviceId,
            kind: device.kind,
            label: device.label,
          })),
          microphoneEnabled: localStorage.getItem('settings/audio/input/enabled'),
          microphoneInput: localStorage.getItem('settings/audio/input'),
          microphoneOffIconVisible: Boolean(document.querySelector('[i-ph\\:microphone-slash]')),
          piniaActionEvents: window.__airiAudioInputE2E?.piniaActionEvents ?? [],
          probeInstalled: Boolean(window.__airiAudioInputE2E),
          streamingTranscriptionReady: window.__airiAudioInputE2E?.streamingTranscriptionReady ?? false,
          url: window.location.href,
        }))
        throw new Error(`Timed out waiting for captured transcription audio: ${JSON.stringify(runtimeState)}`, { cause: error })
      }
      const capturedAudio = await options.page.evaluate(() => window.__airiAudioInputE2E?.transcriptionAudio ?? [])
      return capturedAudio.map(audio => ({
        format: audio.format,
        data: Buffer.from(audio.base64, 'base64'),
      }))
    },
    streamingTranscriptionUpdates: () => session.page.evaluate(() => window.__airiAudioInputE2E?.streamingTranscriptionUpdates ?? []),
    async transcriptionResults(count) {
      await options.page.waitForFunction(expectedCount => (
        (window.__airiAudioInputE2E?.transcriptionResults.length ?? 0) >= expectedCount
      ), count, { timeout: 60_000 })
      return options.page.evaluate(() => window.__airiAudioInputE2E?.transcriptionResults ?? [])
    },
    async completedSpans(name) {
      const runtimeRecords = await options.page.evaluate(readTraceRecords)
      if (session.page === options.page)
        return completedSpansOf(runtimeRecords, name)

      const interactionRecords = await session.page.evaluate(readTraceRecords)
      return completedSpansOf([...runtimeRecords, ...interactionRecords], name)
    },
    async waitForTurn(waitOptions = {}) {
      const timeout = waitOptions.timeout ?? 60_000
      const deadline = Date.now() + timeout
      let turn = createTurnObservation(await session.completedSpans())

      while (!turn && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100))
        turn = createTurnObservation(await session.completedSpans())
      }

      if (!turn) {
        // The turn joins the speech output and model request spans by the turn ID. List what did complete, so a missing span or a mismatched ID is visible.
        const completed = (await session.completedSpans()).map(span => `${span.name}${span.ids[VoiceIdKeys.Turn] ? ` [${String(span.ids[VoiceIdKeys.Turn])}]` : ''}`)
        throw new Error(`Timed out waiting for a completed LLM and speech turn. Completed spans: ${completed.join(', ') || 'none'}`)
      }

      turn.chat.messages = await readChatMessages(session.page)
      return turn
    },
    piniaActionEvents: () => options.page.evaluate(() => window.__airiAudioInputE2E?.piniaActionEvents ?? []),
    async waitForStreamingTranscriptionReady() {
      await options.page.waitForFunction(() => window.__airiAudioInputE2E?.streamingTranscriptionReady === true, undefined, { timeout: 30_000 })
    },
    async waitForVoiceInput(waitOptions = {}) {
      try {
        await options.page.waitForFunction(() => (window.__airiAudioInputE2E?.voiceInputs.length ?? 0) > 0, undefined, { timeout: waitOptions.timeout ?? 60_000 })
      }
      catch (error) {
        // REVIEW:
        // Wake word cases sometimes time out with the model `ready`, about 1 of 4 Mandarin runs on Web.
        // Reruns of the same fixture pass. The cause is unknown.
        // The wake word preparation tells if the timeout came from the model, or from detection after the model was ready.
        const wakeWordPreparation = await options.page.evaluate(() => window.__airiAudioInputE2E?.wakeWordPreparation)
        throw new Error(`Timed out waiting for a voice input. Wake word preparation: ${wakeWordPreparation ?? 'not published'}`, { cause: error })
      }
      const [input] = await options.page.evaluate(() => window.__airiAudioInputE2E?.voiceInputs ?? [])
      return input
    },
    async waitForPiniaAction(waitOptions) {
      return options.page.evaluate(({ actionName, channelName, status, storeId, timeout }) => new Promise<PiniaActionEvent>((resolve, reject) => {
        const channel = new BroadcastChannel(channelName)
        const timeoutId = window.setTimeout(() => {
          channel.close()
          reject(new Error(`Timed out waiting for Pinia action ${storeId}.${actionName} (${status})`))
        }, timeout)

        channel.addEventListener('message', (message: MessageEvent<PiniaActionEvent>) => {
          const action = message.data
          if (action.storeId !== storeId || action.actionName !== actionName || action.status !== status)
            return

          window.clearTimeout(timeoutId)
          channel.close()
          resolve(action)
        })
      }), {
        actionName: waitOptions.actionName,
        channelName: piniaActionTracingChannelName,
        status: waitOptions.status ?? 'completed',
        storeId: waitOptions.storeId,
        timeout: waitOptions.timeout ?? 60_000,
      })
    },
    async snapshot() {
      const runtimeState = await options.page.evaluate(() => window.__airiAudioInputE2E)
      const interactionState = session.page === options.page
        ? runtimeState
        : await session.page.evaluate(() => window.__airiAudioInputE2E)
      return {
        piniaActionEvents: runtimeState?.piniaActionEvents ?? [],
        records: runtimeState?.records ?? [],
        streamingTranscriptionUpdates: interactionState?.streamingTranscriptionUpdates ?? [],
        transcriptionResults: runtimeState?.transcriptionResults ?? [],
        voiceInputs: runtimeState?.voiceInputs ?? [],
      }
    },
    close: options.close,
  }

  return session
}

function createTurnObservation(spans: AudioInputSpan[]): AudioInputTurn | undefined {
  const speechOutputSpan = spans.findLast(span => span.name === VoiceNames.SpeechOutput)
  if (!speechOutputSpan)
    return undefined

  const turnId = idOf(speechOutputSpan, VoiceIdKeys.Turn)
  const llmSpan = spans.findLast(span => (
    span.name === AgentNames.ModelRequest
    && idOf(span, VoiceIdKeys.Turn) === turnId
  ))
  if (!turnId || !llmSpan)
    return undefined

  const inputMessageRoles = stringArrayAttribute(llmSpan, AgentAttributes.LLMInputMessageRoles)
  const outputChunkLengths = numberArrayAttribute(llmSpan, AgentAttributes.LLMOutputChunkLengths)
  const audioSegments = spans
    .filter(span => (
      span.name === VoiceNames.TTSRequest
      && idOf(span, VoiceIdKeys.Turn) === turnId
    ))
    .map(span => ({
      durationMs: numberAttribute(span, VoiceAttributes.TTSAudioDurationMs),
      text: stringAttribute(span, VoiceAttributes.TTSText),
    }))

  return {
    id: turnId,
    chat: { messages: [] },
    llm: {
      inputMessages: inputMessageRoles.map(role => ({ role })),
      outputCharacters: numberAttribute(llmSpan, AgentAttributes.LLMTextLength),
      outputChunks: outputChunkLengths.map(characters => ({ characters })),
    },
    tts: { audioSegments },
  }
}

async function readChatMessages(page: Page): Promise<AudioInputChatMessage[]> {
  return page.locator('[data-chat-message-role]').evaluateAll(elements => elements.flatMap((element) => {
    const role = element.getAttribute('data-chat-message-role')
    const text = element.textContent?.trim() ?? ''
    if ((role !== 'assistant' && role !== 'user') || !text)
      return []
    return [{ role, text }]
  }))
}

function idOf(span: AudioInputSpan, key: string): string {
  const value = span.ids[key]
  return value === undefined ? '' : String(value)
}

function numberAttribute(span: AudioInputSpan, name: string): number {
  const value = span.attrs[name]
  return typeof value === 'number' ? value : 0
}

function numberArrayAttribute(span: AudioInputSpan, name: string): number[] {
  const value = span.attrs[name]
  return Array.isArray(value) ? value.filter(item => typeof item === 'number') : []
}

function stringAttribute(span: AudioInputSpan, name: string): string {
  const value = span.attrs[name]
  return typeof value === 'string' ? value : ''
}

function stringArrayAttribute(span: AudioInputSpan, name: string): string[] {
  const value = span.attrs[name]
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}
