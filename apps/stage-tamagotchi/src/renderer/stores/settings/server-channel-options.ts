export type ServerChannelExposureMode = 'this-device' | 'all' | 'advanced'

const LOOPBACK_HOSTNAMES = new Set(['', '127.0.0.1', 'localhost', '::1'])
const ALL_INTERFACE_HOSTNAMES = new Set(['0.0.0.0', '::'])

export function serverChannelExposureModeFromHostname(hostname?: string): ServerChannelExposureMode {
  const normalizedHostname = hostname?.trim() ?? ''

  if (LOOPBACK_HOSTNAMES.has(normalizedHostname))
    return 'this-device'

  if (ALL_INTERFACE_HOSTNAMES.has(normalizedHostname))
    return 'all'

  return 'advanced'
}

export function hostnameFromExposureMode(mode: ServerChannelExposureMode, manualHostname?: string) {
  if (mode === 'all')
    return '0.0.0.0'

  if (mode === 'advanced') {
    const normalizedHostname = manualHostname?.trim() ?? ''
    return normalizedHostname || '127.0.0.1'
  }

  return '127.0.0.1'
}
