import type { TranscriptionProvider } from '@xsai-ext/providers/utils'

import { defineStreamInvoke } from '@moeru/eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { defineProvider } from '@proj-airi/stage-ui/libs/providers/providers/registry'
import { z } from 'zod'

import {
  electronAppleSpeechGetCapabilities,
  electronAppleSpeechTranscribe,
  electronAppleSpeechTranscribeStream,
} from '../../shared/eventa'

export const appleSpeechTranscriptionProviderId = 'apple-speech-transcription'

const getCapabilities = useElectronEventaInvoke(electronAppleSpeechGetCapabilities)
const transcribe = useElectronEventaInvoke(electronAppleSpeechTranscribe)
const transcribeStream = defineStreamInvoke(getElectronEventaContext(), electronAppleSpeechTranscribeStream)
const sseEncoder = new TextEncoder()

function toByteArray(chunk: ArrayBuffer | ArrayBufferView) {
  if (chunk instanceof ArrayBuffer)
    return new Uint8Array(chunk)

  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

function createAppleSpeechStreamResponse(
  audioStream: ReadableStream<ArrayBuffer | ArrayBufferView>,
  locale: string,
  signal?: AbortSignal | null,
) {
  const audioReader = audioStream.getReader()
  let sentStart = false
  const request = new ReadableStream({
    async pull(controller) {
      if (!sentStart) {
        sentStart = true
        controller.enqueue({ type: 'start' as const, locale, sampleRate: 16000 })
        return
      }

      const chunk = await audioReader.read()
      if (chunk.done) {
        controller.close()
        return
      }

      controller.enqueue({ type: 'audio' as const, audio: toByteArray(chunk.value) })
    },
    async cancel(reason) {
      await audioReader.cancel(reason)
    },
  })
  const updates = transcribeStream(request, { signal: signal ?? undefined })
  const body = updates.pipeThrough(new TransformStream({
    transform(update, controller) {
      controller.enqueue(sseEncoder.encode(`data: ${JSON.stringify({
        ...update,
        type: 'transcript.text.snapshot',
      })}\n\n`))
    },
  }))

  return new Response(body, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    },
  })
}

function fileExtension(file: File) {
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (extension && /^[a-z0-9]+$/.test(extension))
    return extension

  if (file.type === 'audio/mp4')
    return 'm4a'
  if (file.type === 'audio/aiff')
    return 'aiff'
  return 'wav'
}

const providerAppleSpeechTranscription = defineProvider({
  id: appleSpeechTranscriptionProviderId,
  name: 'Apple Speech',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.apple-speech-transcription.title'),
  description: 'On-device transcription provided by macOS.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.apple-speech-transcription.description'),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt', 'streaming-transcription'],
  icon: 'i-simple-icons:apple',
  requiresCredentials: false,
  autoConfigureWhenAvailable: true,
  isAvailableBy: async () => (await getCapabilities()).available,
  capabilities: {
    transcription: {
      protocol: 'http',
      generateOutput: true,
      streamOutput: true,
      streamInput: true,
    },
  },
  createProviderConfig: () => z.object({}),
  createProvider() {
    return {
      transcription: (model) => {
        const fetch: typeof globalThis.fetch = async (_input, init) => {
          if (init?.body instanceof ReadableStream)
            return createAppleSpeechStreamResponse(init.body, model, init.signal)

          if (!(init?.body instanceof FormData))
            throw new TypeError('Apple Speech transcription requires multipart audio input.')

          const requestedModel = init.body.get('model')
          const file = init.body.get('file')
          if (typeof requestedModel !== 'string' || !(file instanceof File))
            throw new TypeError('Apple Speech transcription requires a locale model and audio file.')

          const result = await transcribe({
            audio: new Uint8Array(await file.arrayBuffer()),
            fileExtension: fileExtension(file),
            locale: requestedModel,
          })
          return Response.json({ text: result.text })
        }

        return {
          apiKey: '',
          baseURL: 'apple-speech://local/',
          fetch,
          model,
        }
      },
    } satisfies TranscriptionProvider
  },
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async () => {
      const capabilities = await getCapabilities()
      const installedLocales = new Set(capabilities.installedLocales)
      const preferredLocale = navigator.language.replace('-', '_')
      return capabilities.supportedLocales.toSorted((left, right) => {
        if (left === preferredLocale)
          return -1
        if (right === preferredLocale)
          return 1
        return Number(installedLocales.has(right)) - Number(installedLocales.has(left))
          || left.localeCompare(right)
      }).map(locale => ({
        id: locale,
        name: locale.replaceAll('_', '-'),
        provider: appleSpeechTranscriptionProviderId,
      }))
    },
  },
})

export { providerAppleSpeechTranscription }
