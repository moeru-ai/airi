import type { ElectronWindow } from './window'

declare global {
  interface Window extends ElectronWindow {}
}
