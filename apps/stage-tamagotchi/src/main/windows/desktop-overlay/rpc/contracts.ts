import { defineContract } from '@moeru/eventa'

export interface DesktopOverlayReadiness {
  state: 'booting' | 'ready' | 'degraded'
  error?: string
}

export const getDesktopOverlayReadinessContract = defineContract<
  void,
  DesktopOverlayReadiness
>('desktop-overlay:getReadiness')
