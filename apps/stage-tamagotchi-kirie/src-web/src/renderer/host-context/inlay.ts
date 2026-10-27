import { defineInvoke } from '@moeru/eventa'

import { airiInlayReturnHome, airiOpenInlay } from '../../shared/eventa'
import { initializeHostContext } from './owner'

/** Opens the reusable Inlay without activation and restores its home position on request. */
export function useHostInlay() {
  const { context } = initializeHostContext()
  const open = defineInvoke(context, airiOpenInlay)
  const returnHome = defineInvoke(context, airiInlayReturnHome)

  return {
    open: () => open({}),
    returnHome: () => returnHome({}),
  }
}
