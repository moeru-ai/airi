import { defineExtension } from '@proj-airi/plugin-sdk'

function nowIso() {
  return new Date().toISOString()
}

/**
 * Example plugin for verifying plugin-host lifecycle in devtools.
 *
 * This module uses the public extension authoring API so it matches the
 * package shape expected by the current host loader.
 */
export default defineExtension({
  id: 'devtools-sample-plugin',
  setup() {
    console.info('[devtools-sample-plugin] setup', { at: nowIso() })
  },
})
