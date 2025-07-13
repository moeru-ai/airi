import type { PACKAGE_MANAGERS } from './plugins/InstallationTabs'

import { reactive } from 'vue'

export const store = reactive({
  packageManager: 'npm' as typeof PACKAGE_MANAGERS[number],
})
