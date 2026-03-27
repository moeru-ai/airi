import { describe, expect, it } from 'vitest'

import { pickAvailableAudioInputId } from './audio-device'

function createAudioInput(deviceId: string, label: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: '',
    kind: 'audioinput',
    label,
    toJSON: () => ({}),
  } as MediaDeviceInfo
}

describe('pickAvailableAudioInputId', () => {
  it('keeps the preferred device when it is still available', () => {
    const inputs = [
      createAudioInput('default', 'Default Microphone'),
      createAudioInput('usb-mic', 'USB Microphone'),
    ]

    expect(pickAvailableAudioInputId(inputs, 'usb-mic')).toBe('usb-mic')
  })

  it('falls back to the default device when the preferred device is stale', () => {
    const inputs = [
      createAudioInput('default', 'Default Microphone'),
      createAudioInput('usb-mic', 'USB Microphone'),
    ]

    expect(pickAvailableAudioInputId(inputs, 'missing-device')).toBe('default')
  })

  it('falls back to the first available device when no default device exists', () => {
    const inputs = [
      createAudioInput('usb-mic', 'USB Microphone'),
      createAudioInput('builtin-mic', 'Built-in Microphone'),
    ]

    expect(pickAvailableAudioInputId(inputs, 'missing-device')).toBe('usb-mic')
  })

  it('returns an empty string when there are no audio inputs', () => {
    expect(pickAvailableAudioInputId([], 'missing-device')).toBe('')
  })
})
