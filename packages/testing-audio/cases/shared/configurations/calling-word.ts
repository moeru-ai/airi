import type { AiriCard, WakeWordKeyword } from '@proj-airi/stage-ui/types'

import type { AudioInputPreflightCallback, AudioInputPreflightContext } from '../../../src/types'

import { sherpawModelArtifactUrl } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { KWS_MODEL } from '@proj-airi/stage-ui/libs/kws-model-info'

import { prepareCallingWordModel } from '../../../src/setup/calling-word-model'
import { configureStorage } from './storage'

export interface CallingWordConfiguration {
  targetCardId: string
  label: string
  tokens: string[]
  score?: number
  threshold?: number
}

type CallingWordResolver = (context: AudioInputPreflightContext) => CallingWordConfiguration | undefined | Promise<CallingWordConfiguration | undefined>

/** Configures one card and the file-backed microphone for a KWS audio case. */
export function configureCallingWord(resolve: CallingWordResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    if (context.runtime.target === 'web') {
      const modelFiles = await prepareCallingWordModel()
      for (const filename of ['preload.data', 'preload.js.metadata'] as const) {
        await context.runtime.runtimePage.route(sherpawModelArtifactUrl(KWS_MODEL, filename), route => route.fulfill({
          path: modelFiles[filename],
          contentType: filename.endsWith('.metadata') ? 'application/json' : 'application/octet-stream',
          headers: { 'access-control-allow-origin': '*' },
        }))
      }
    }

    const keyword: WakeWordKeyword = {
      label: configuration.label,
      matches: [{
        tokens: configuration.tokens,
        ...(configuration.score === undefined ? {} : { score: configuration.score }),
        ...(configuration.threshold === undefined ? {} : { threshold: configuration.threshold }),
      }],
    }

    await context.runtime.runtimePage.evaluate(({ configuredKeyword, targetCardId }) => {
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

      const targetCard = structuredClone(activeCard)
      targetCard.extensions.airi.modules.wakeWords = { keywords: [configuredKeyword] }
      cards.push([targetCardId, targetCard])
      localStorage.setItem('airi-cards', JSON.stringify(cards))
    }, { configuredKeyword: keyword, targetCardId: configuration.targetCardId })

    const settings: Record<string, string> = {
      'settings/audio/input/enabled': 'true',
      'settings/audio/input/mode': 'wake-word',
      'settings/audio/input/wake-setup-prompted': 'true',
    }

    if (context.runtime.target === 'electron') {
      const microphoneInput = await context.runtime.runtimePage.evaluate(async () => {
        const devices = await navigator.mediaDevices.enumerateDevices()
        return devices.find(device => device.kind === 'audioinput' && device.label.includes('Fake'))?.deviceId
      })
      if (!microphoneInput)
        throw new Error('Chromium did not expose the file-backed fake microphone.')
      settings['settings/audio/input'] = microphoneInput
    }

    await configureStorage(context.runtime, settings)
  }
}
