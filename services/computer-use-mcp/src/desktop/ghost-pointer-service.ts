import type { GhostPointerState } from './types'

export class GhostPointerService {
  private state: GhostPointerState = {
    visible: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    style: 'follow',
  }

  getState() {
    return { ...this.state }
  }

  followPointer(pointer: { x: number, y: number }, label?: string) {
    this.state = {
      ...this.state,
      visible: true,
      x: pointer.x,
      y: pointer.y,
      targetX: pointer.x,
      targetY: pointer.y,
      label,
      style: 'follow',
    }

    return this.getState()
  }

  previewPointerMove(target: { x: number, y: number }, label?: string) {
    this.state = {
      ...this.state,
      visible: true,
      targetX: target.x,
      targetY: target.y,
      label,
      style: 'preview',
    }

    return this.getState()
  }

  markActing(target: { x: number, y: number }, label?: string) {
    this.state = {
      ...this.state,
      visible: true,
      targetX: target.x,
      targetY: target.y,
      label,
      style: 'acting',
    }

    return this.getState()
  }

  markError(label?: string) {
    this.state = {
      ...this.state,
      visible: true,
      label,
      style: 'error',
    }

    return this.getState()
  }

  hide() {
    this.state = {
      ...this.state,
      visible: false,
      style: 'follow',
    }

    return this.getState()
  }
}
