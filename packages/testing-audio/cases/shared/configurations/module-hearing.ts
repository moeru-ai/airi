import type { AudioCaptureFormat } from '@proj-airi/vitest-plugin-fakemic'

import type { AudioInputPreflightCallback, AudioInputPreflightContext } from '../../../src/types'
import type { ProviderConfiguration } from './provider'

import { configureProvider } from './provider'
import { configureStorage } from './storage'

export interface HearingModuleConfiguration {
  /** @default undefined */
  captureFormat?: AudioCaptureFormat
  /** @default false */
  microphoneEnabled?: boolean
  provider: ProviderConfiguration
}

type HearingModuleResolver = (context: AudioInputPreflightContext) => HearingModuleConfiguration | undefined | Promise<HearingModuleConfiguration | undefined>

/** Configures the hearing module with the ASR Provider selected by one case. */
export function configureModuleHearing(resolve: HearingModuleResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    await configureProvider(context.runtime, configuration.provider)
    const settings: Record<string, string> = {
      'settings/hearing/active-provider': configuration.provider.id,
      'settings/hearing/active-model': configuration.provider.model,
      'settings/audio/input/enabled': String(configuration.microphoneEnabled ?? false),
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
    context.runtime.transcriptionCaptureFormat = configuration.captureFormat
  }
}
