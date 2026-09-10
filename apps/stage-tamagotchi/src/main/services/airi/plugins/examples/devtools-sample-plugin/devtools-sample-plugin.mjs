function nowIso() {
  return new Date().toISOString()
}

/**
 * Example plugin for verifying plugin-host lifecycle in devtools.
 *
 * This file represents bundled Extension output. It uses the public runtime
 * shape without a workspace package import, so an imported copy is self-contained.
 */
export default {
  id: 'devtools-sample-plugin',
  setup() {
    console.info('[devtools-sample-plugin] setup', { at: nowIso() })
  },
}
