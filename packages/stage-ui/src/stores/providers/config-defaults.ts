export function normalizeProviderConfigDefaults(config: Record<string, unknown>, defaultOptions: Record<string, unknown>) {
  const keys = [...new Set([...Object.keys(defaultOptions), ...Object.keys(config)])]
  return Object.fromEntries(keys.map((key) => {
    if (Object.hasOwn(config, key))
      return [key, config[key]]

    return [key, defaultOptions[key]]
  }))
}
