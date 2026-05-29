import { describe, expect, it } from 'vitest'

import { hostnameFromExposureMode, serverChannelExposureModeFromHostname } from './server-channel-options'

describe('serverChannelExposureModeFromHostname', () => {
  it('maps loopback hostnames to this-device mode', () => {
    expect(serverChannelExposureModeFromHostname('127.0.0.1')).toBe('this-device')
    expect(serverChannelExposureModeFromHostname('localhost')).toBe('this-device')
    expect(serverChannelExposureModeFromHostname('::1')).toBe('this-device')
    expect(serverChannelExposureModeFromHostname('')).toBe('this-device')
  })

  it('maps wildcard bind hostnames to all mode', () => {
    expect(serverChannelExposureModeFromHostname('0.0.0.0')).toBe('all')
    expect(serverChannelExposureModeFromHostname('::')).toBe('all')
  })

  it('maps custom hostnames to advanced mode', () => {
    expect(serverChannelExposureModeFromHostname('192.168.1.25')).toBe('advanced')
    expect(serverChannelExposureModeFromHostname('airi.local')).toBe('advanced')
  })
})

describe('hostnameFromExposureMode', () => {
  it('returns a secure loopback hostname for this-device mode', () => {
    expect(hostnameFromExposureMode('this-device', '192.168.1.25')).toBe('127.0.0.1')
  })

  it('returns an all-interfaces hostname for all mode', () => {
    expect(hostnameFromExposureMode('all', '127.0.0.1')).toBe('0.0.0.0')
  })

  it('uses the manual hostname for advanced mode and trims whitespace', () => {
    expect(hostnameFromExposureMode('advanced', '  192.168.1.25  ')).toBe('192.168.1.25')
  })

  it('falls back to loopback when advanced mode is empty', () => {
    expect(hostnameFromExposureMode('advanced', '   ')).toBe('127.0.0.1')
  })
})
