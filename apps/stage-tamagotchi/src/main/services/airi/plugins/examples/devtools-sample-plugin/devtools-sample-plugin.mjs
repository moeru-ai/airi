function nowIso() {
  return new Date().toISOString()
}

/**
 * Example plugin for verifying plugin-host lifecycle in devtools.
 *
 * This module intentionally avoids external package imports so it can run
 * from the userData plugins folder without additional dependency setup.
 */
export async function init(_context) {
  const _logger = (...a) => void 0
  _logger('[devtools-sample-plugin] init', { at: nowIso() })
}

export async function setupModules({ apis }) {
  const providers = await apis.providers.listProviders()
  const _logger = (...a) => void 0
  _logger('[devtools-sample-plugin] setupModules', {
    at: nowIso(),
    providerCount: providers.length,
    providerNames: providers.map((provider) => provider.name),
  })
}
