import type { ElectronServerChannelConfig } from '../../../../shared/eventa'

export function ensureServerChannelConfigDefaults(
  config: Partial<ElectronServerChannelConfig>,
  generateToken: () => string,
) {
  const nextConfig: ElectronServerChannelConfig = {
    authToken: config.authToken?.trim() || generateToken(),
    hostname: config.hostname?.trim() || '127.0.0.1',
    tlsConfig: config.tlsConfig || null,
  }

  const previousConfig: ElectronServerChannelConfig = {
    authToken: config.authToken?.trim() || '',
    hostname: config.hostname?.trim() || '127.0.0.1',
    tlsConfig: config.tlsConfig || null,
  }

  return {
    changed: JSON.stringify(previousConfig) !== JSON.stringify(nextConfig),
    config: nextConfig,
  }
}
