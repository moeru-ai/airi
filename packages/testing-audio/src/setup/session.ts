import type { PiniaActionEvent } from '@proj-airi/stage-shared/types/pinia-action-event'
import type { AudioCapture } from '@proj-airi/vitest-plugin-fakemic'
import type { ElectronApplication, Page } from 'playwright'

import type { AudioInputChatMessage, AudioInputSession, AudioInputTarget, AudioInputTurn } from '../types'

import { Buffer } from 'node:buffer'

import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared/perf/io-trace'
import { piniaActionTracingChannelName } from '@proj-airi/stage-shared/types/pinia-action-event'

import { readCompletedSpans } from './browser-probe'

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
          vadReady: window.__airiAudioInputE2E?.vadReady ?? false,
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
      const runtimeSpans = await options.page.evaluate(readCompletedSpans, name)
      if (session.page === options.page)
        return runtimeSpans

      const interactionSpans = await session.page.evaluate(readCompletedSpans, name)
      return [...runtimeSpans, ...interactionSpans]
    },
    async waitForTurn(waitOptions = {}) {
      const timeout = waitOptions.timeout ?? 60_000
      const deadline = Date.now() + timeout
      let turn = createTurnObservation(await session.completedSpans())

      while (!turn && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100))
        turn = createTurnObservation(await session.completedSpans())
      }

      if (!turn)
        throw new Error('Timed out waiting for a completed LLM and speech turn.')

      turn.chat.messages = await readChatMessages(session.page)
      return turn
    },
    piniaActionEvents: () => options.page.evaluate(() => window.__airiAudioInputE2E?.piniaActionEvents ?? []),
    async waitForVadReady() {
      await options.page.waitForFunction(() => window.__airiAudioInputE2E?.vadReady === true, undefined, { timeout: 30_000 })
    },
    async waitForStreamingTranscriptionReady() {
      await options.page.waitForFunction(() => window.__airiAudioInputE2E?.streamingTranscriptionReady === true, undefined, { timeout: 30_000 })
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
        spans: runtimeState?.spans ?? [],
        streamingTranscriptionUpdates: interactionState?.streamingTranscriptionUpdates ?? [],
        transcriptionResults: runtimeState?.transcriptionResults ?? [],
      }
    },
    close: options.close,
  }

  return session
}

function createTurnObservation(spans: Awaited<ReturnType<AudioInputSession['completedSpans']>>): AudioInputTurn | undefined {
  const speechTurnSpan = spans.findLast(span => span.name === IOSpanNames.SpeechTurn)
  if (!speechTurnSpan)
    return undefined

  const turnId = stringAttribute(speechTurnSpan, IOAttributes.TurnId)
  const llmSpan = spans.findLast(span => (
    span.name === IOSpanNames.LLMInference
    && stringAttribute(span, IOAttributes.TurnId) === turnId
  ))
  if (!turnId || !llmSpan)
    return undefined

  const inputMessageRoles = stringArrayAttribute(llmSpan, IOAttributes.LLMInputMessageRoles)
  const outputChunkLengths = numberArrayAttribute(llmSpan, IOAttributes.LLMOutputChunkLengths)
  const audioSegments = spans
    .filter(span => (
      span.name === IOSpanNames.TTSSynthesis
      && stringAttribute(span, IOAttributes.TurnId) === turnId
    ))
    .toSorted((left, right) => Number(left.startTimeNano) - Number(right.startTimeNano))
    .map(span => ({
      durationMs: numberAttribute(span, IOAttributes.TTSAudioDurationMs),
      text: stringAttribute(span, IOAttributes.TTSText),
    }))

  return {
    id: turnId,
    chat: { messages: [] },
    llm: {
      inputMessages: inputMessageRoles.map(role => ({ role })),
      outputCharacters: numberAttribute(llmSpan, IOAttributes.LLMTextLength),
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

function numberAttribute(span: Awaited<ReturnType<AudioInputSession['completedSpans']>>[number], name: string): number {
  const value = span.attributes[name]
  return typeof value === 'number' ? value : 0
}

function numberArrayAttribute(span: Awaited<ReturnType<AudioInputSession['completedSpans']>>[number], name: string): number[] {
  const value = span.attributes[name]
  return Array.isArray(value) ? value.filter(item => typeof item === 'number') : []
}

function stringAttribute(span: Awaited<ReturnType<AudioInputSession['completedSpans']>>[number], name: string): string {
  const value = span.attributes[name]
  return typeof value === 'string' ? value : ''
}

function stringArrayAttribute(span: Awaited<ReturnType<AudioInputSession['completedSpans']>>[number], name: string): string[] {
  const value = span.attributes[name]
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}
