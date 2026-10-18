/** A rounded rectangle in top-left Electron content points, after page zoom is applied. */
export interface BackdropClip {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

/** One desktop-blur surface. Each clip intersects this surface and every preceding clip. */
export interface BackdropRegion extends BackdropClip {
  id: string
  opacity: number
  clips: BackdropClip[]
}
