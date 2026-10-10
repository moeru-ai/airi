import type { WakeWord } from '@proj-airi/stage-ui/libs/voice/wake-words'
import type { AiriCard } from '@proj-airi/stage-ui/types'

import type { AudioInputPreflightCallback, AudioInputPreflightContext } from '../../../src/types'

import { sherpawModelArtifactUrl } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { kwsModel } from '@proj-airi/stage-ui/libs/voice/kws-model-info'

import { prepareWakeWordModel } from '../../../src/setup/wake-word-model'
import { configureStorage } from './storage'

export interface WakeWordConfiguration {
  /** ID of a new AIRI Card that owns the wake word. The active card stays active. */
  targetCardId: string
  /** Written wake word, for example the character name. */
  text: string
  /** One pronunciation as tokens of the pinned KWS model vocabulary. */
  tokens: string[]
}

type WakeWordResolver = (context: AudioInputPreflightContext) => WakeWordConfiguration | undefined | Promise<WakeWordConfiguration | undefined>

/**
 * Adds one AIRI Card with a wake word and selects the `wake-word` Hearing input mode with the microphone on.
 *
 * The case needs no ASR Provider. On Web, the callback serves the verified model from the workspace cache, so the
 * model asset repository installs it without a network download. Electron loads the pack from its bundle.
 *
 * @example
 * configureWakeWord(() => ({ targetCardId: 'wake-target', text: 'Light up', tokens: ['L', 'AY1', 'T', 'AH1', 'P'] }))
 */
export function configureWakeWord(resolve: WakeWordResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    if (context.runtime.target === 'web') {
      const modelFiles = await prepareWakeWordModel()
      for (const filename of ['preload.data', 'preload.js.metadata'] as const) {
        // The build can use a Hugging Face mirror, so the route matches the pinned path on any host.
        const pinnedPath = new URL(sherpawModelArtifactUrl(kwsModel, filename)).pathname
        await context.runtime.runtimePage.route(url => url.pathname === pinnedPath, route => route.fulfill({
          path: modelFiles[filename],
          contentType: filename.endsWith('.metadata') ? 'application/json' : 'application/octet-stream',
          headers: { 'access-control-allow-origin': '*' },
        }))
      }
    }

    const wakeWord: WakeWord = { text: configuration.text, modelId: kwsModel.id, pronunciations: [configuration.tokens] }
    await context.runtime.runtimePage.evaluate(({ configuredWakeWord, targetCardId }) => {
      const serializedCards = localStorage.getItem('airi-cards')
      if (!serializedCards)
        throw new Error('The AIRI Card store is not initialized.')

      const activeCardId = localStorage.getItem('airi-card-active-id') ?? 'default'
      const cards = JSON.parse(serializedCards) as Array<[string, AiriCard]>
      const activeCard = cards.find(([cardId]) => cardId === activeCardId)?.[1]
      if (!activeCard)
        throw new Error(`The active AIRI Card "${activeCardId}" does not exist.`)

      if (cards.some(([cardId]) => cardId === targetCardId))
        throw new Error(`The AIRI Card "${targetCardId}" already exists.`)

      // The copy keeps valid Provider modules. Only the wake word separates the target from the active card.
      const targetCard = structuredClone(activeCard)
      targetCard.extensions.airi.wakeWords = [configuredWakeWord]
      cards.push([targetCardId, targetCard])
      localStorage.setItem('airi-cards', JSON.stringify(cards))
    }, { configuredWakeWord: wakeWord, targetCardId: configuration.targetCardId })

    const microphoneInput = await context.runtime.runtimePage.evaluate(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.find(device => device.kind === 'audioinput' && device.label.includes('Fake'))?.deviceId
    })
    if (!microphoneInput)
      throw new Error('Chromium did not expose the file-backed fake microphone.')

    const settings: Record<string, string> = {
      'settings/audio/input': microphoneInput,
      'settings/audio/input/enabled': 'true',
      'settings/hearing/input-mode': 'wake-word',
    }

    await configureStorage(context.runtime, settings)
  }
}
