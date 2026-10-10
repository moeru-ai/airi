import type { Rectangle } from './protocol'

/** Minimal KWin 6 script boundary. These declarations do not claim a live compositor compatibility check. */
export interface Signal {
  connect: (handler: () => void) => void
  disconnect: (handler: () => void) => void
}

/** Only enrolled AIRI windows reach this boundary. Do not enumerate or serialize other window metadata. */
export interface Window {
  readonly internalId: string
  readonly pid: number
  readonly resourceClass: string
  readonly managed: boolean
  readonly deleted: boolean
  readonly move: boolean
  readonly resize: boolean
  readonly moveable: boolean
  readonly resizeable: boolean
  frameGeometry: Rectangle
  readonly frameGeometryChanged: Signal
  readonly closed: Signal
}

/** Output names are session-local IDs. Do not export monitor serial numbers or EDID data. */
export interface Output {
  readonly name: string
  readonly geometry: Rectangle
  readonly devicePixelRatio: number
  readonly geometryChanged: Signal
  readonly scaleChanged: Signal
}

/** clientArea uses KWin.WorkArea and workspace.currentDesktop in the future native script entry point. */
export interface Workspace {
  readonly cursorPos: { x: number, y: number }
  readonly cursorPosChanged: Signal
  readonly screens: Output[]
  readonly screensChanged: Signal
  readonly currentDesktop: { readonly id: string }
  readonly currentDesktopChanged: Signal
  clientArea: (option: number, output: Output, desktop: { readonly id: string }) => Rectangle
}
