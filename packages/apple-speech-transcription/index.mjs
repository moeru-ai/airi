import process from 'node:process'

import { createRequire } from 'node:module'
import { release } from 'node:os'

import { errorMessageFrom } from '@moeru/std'

const require = createRequire(import.meta.url)

function supportsAppleSpeechAnalyzer() {
  if (process.platform !== 'darwin')
    return false

  const darwinMajor = Number.parseInt(release().split('.')[0] ?? '', 10)
  return Number.isFinite(darwinMajor) && darwinMajor >= 25
}

function loadBinding() {
  if (!supportsAppleSpeechAnalyzer())
    return undefined

  return require(`./native/darwin-${process.arch}/apple-speech-transcription.node`)
}

function createAsyncQueue() {
  const values = []
  const waiters = []
  let failure
  let stopped = false

  function settleWaiter(waiter) {
    if (failure) {
      waiter.reject(failure)
      return
    }
    if (values.length > 0) {
      waiter.resolve({ done: false, value: values.shift() })
      return
    }
    if (stopped)
      waiter.resolve({ done: true, value: undefined })
  }

  return {
    push(value) {
      if (stopped)
        return
      const waiter = waiters.shift()
      if (waiter) {
        waiter.resolve({ done: false, value })
        return
      }
      values.push(value)
    },
    close() {
      if (stopped)
        return
      stopped = true
      while (waiters.length > 0)
        settleWaiter(waiters.shift())
    },
    fail(error) {
      if (stopped)
        return
      failure = error instanceof Error ? error : new Error(errorMessageFrom(error) ?? 'Apple Speech transcription failed.')
      stopped = true
      while (waiters.length > 0)
        settleWaiter(waiters.shift())
    },
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (failure)
              return Promise.reject(failure)
            if (values.length > 0)
              return Promise.resolve({ done: false, value: values.shift() })
            if (stopped)
              return Promise.resolve({ done: true, value: undefined })

            return new Promise((resolve, reject) => waiters.push({ reject, resolve }))
          },
        }
      },
    },
  }
}

function toByteArray(chunk) {
  if (chunk instanceof Uint8Array)
    return chunk
  if (chunk instanceof ArrayBuffer)
    return new Uint8Array(chunk)
  if (ArrayBuffer.isView(chunk))
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)

  throw new TypeError('Apple Speech streaming input must contain ArrayBuffer or ArrayBufferView chunks.')
}

/** Returns whether Apple Speech transcription is available on this Mac. */
export async function getCapabilities() {
  const binding = loadBinding()
  if (!binding) {
    return {
      available: false,
      installedLocales: [],
      reason: 'Apple Speech transcription requires macOS 26 or later.',
      supportedLocales: [],
    }
  }

  return JSON.parse(await binding.getCapabilities())
}

/** Transcribes encoded audio bytes with Apple's on-device speech model. */
export async function transcribeAudio(audio, locale, fileExtension) {
  const binding = loadBinding()
  if (!binding)
    throw new Error('Apple Speech transcription requires macOS 26 or later.')

  return JSON.parse(await binding.transcribeAudio(audio, locale, fileExtension))
}

/** Transcribes one local audio file with Apple's on-device speech model. */
export async function transcribeFile(path, locale) {
  const binding = loadBinding()
  if (!binding)
    throw new Error('Apple Speech transcription requires macOS 26 or later.')

  return JSON.parse(await binding.transcribeFile(path, locale))
}

/** Transcribes a live mono PCM16 stream and yields replaceable text snapshots. */
export async function* transcribePcmStream(audioStream, locale, sampleRate, options = {}) {
  const binding = loadBinding()
  if (!binding)
    throw new Error('Apple Speech transcription requires macOS 26 or later.')
  if (!audioStream || typeof audioStream[Symbol.asyncIterator] !== 'function')
    throw new TypeError('Apple Speech streaming transcription requires an async audio stream.')

  const queue = createAsyncQueue()
  let streamComplete = false

  const onUpdate = (json, error, complete) => {
    if (error) {
      streamComplete = true
      queue.fail(new Error(error))
      return
    }
    if (json)
      queue.push(JSON.parse(json))
    if (complete) {
      streamComplete = true
      queue.close()
    }
  }

  const sessionIdentifier = await binding.startStreaming(locale, sampleRate, onUpdate)
  const abort = () => {
    if (!streamComplete)
      queue.fail(options.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
  }
  options.signal?.addEventListener('abort', abort, { once: true })

  const inputTask = (async () => {
    try {
      for await (const chunk of audioStream) {
        if (options.signal?.aborted)
          throw options.signal.reason ?? new DOMException('Aborted', 'AbortError')
        await binding.appendStreamingAudio(sessionIdentifier, toByteArray(chunk))
      }
      await binding.finishStreaming(sessionIdentifier)
    }
    catch (error) {
      await binding.cancelStreaming(sessionIdentifier).catch(() => undefined)
      queue.fail(error)
    }
  })()

  try {
    for await (const update of queue.iterable)
      yield update
    await inputTask
  }
  finally {
    options.signal?.removeEventListener('abort', abort)
    if (!streamComplete)
      await binding.cancelStreaming(sessionIdentifier).catch(() => undefined)
  }
}
