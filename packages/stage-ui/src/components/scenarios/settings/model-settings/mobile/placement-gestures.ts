import type { Ref } from 'vue'

type Pointer = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>

/** Keeps single-pointer movement and two-pointer scale changes in the same placement session. */
export class PlacementGestures {
  private pointers = new Map<number, Pointer>()
  private size = { width: 1, height: 1 }
  private drag?: { pointer: Pointer, origin: { x: number, y: number } }
  private pinch?: { distance: number, scale: number }

  /** Edits the same persisted values that the position and size rulers use. */
  constructor(private scale: Ref<number>, private position: Ref<{ x: number, y: number }>) {}

  /** Restarts the baseline whenever the active pointer count changes. */
  private rebase() {
    this.drag = undefined
    this.pinch = undefined
    const [first, second] = this.pointers.values()
    if (this.pointers.size === 1) {
      this.drag = { pointer: first, origin: { ...this.position.value } }
    }
    else if (this.pointers.size === 2) {
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
      if (distance > 0)
        this.pinch = { distance, scale: this.scale.value }
    }
  }

  /** Switches from movement to scaling when a second pointer joins the surface. */
  start(pointer: Pointer, size: Pick<DOMRect, 'width' | 'height'>) {
    this.size = { width: size.width, height: size.height }
    this.pointers.set(pointer.pointerId, pointer)
    this.rebase()
  }

  /** Uses the original gesture baseline so repeated events cannot accumulate scale or position drift. */
  move(pointer: Pointer) {
    if (!this.pointers.has(pointer.pointerId))
      return

    this.pointers.set(pointer.pointerId, pointer)
    if (this.pinch) {
      const [first, second] = this.pointers.values()
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
      // Match the size ruler's 0.1–3 range and 0.01 step. Pinching does not change the model position.
      this.scale.value = Math.round(Math.min(3, Math.max(0.1, this.pinch.scale * distance / this.pinch.distance)) * 100) / 100
    }
    else if (this.drag && this.size.width > 0 && this.size.height > 0) {
      // Pointer Y grows downward. The renderer stores model Y upward, as a percentage of the stage size.
      this.position.value = {
        x: Math.round(this.drag.origin.x + ((pointer.clientX - this.drag.pointer.clientX) / this.size.width) * 100),
        y: Math.round(this.drag.origin.y - ((pointer.clientY - this.drag.pointer.clientY) / this.size.height) * 100),
      }
    }
  }

  /** Lets the remaining finger resume movement from its current position without a jump. */
  end(pointerId: number) {
    if (this.pointers.delete(pointerId))
      this.rebase()
  }

  /** Drops transient pointers when the browser cancels input or the editor changes model or tab. */
  reset() {
    this.pointers.clear()
    this.drag = undefined
    this.pinch = undefined
  }
}
