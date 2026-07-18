import { defineExtension } from '../../extension'

export default defineExtension({
  id: 'test-plugin-no-connect',
  setup() {
    throw new Error('Plugin initialization aborted by plugin: test-plugin-no-connect')
  },
})
