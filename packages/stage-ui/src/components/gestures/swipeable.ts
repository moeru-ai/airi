/** Input source that can drive Swipeable. */
export type SwipeableInput = 'touch' | 'wheel'

/** Horizontal direction that selects the action. */
export type SwipeableDirection = 'left' | 'right'

/** Configuration for the Swipeable gesture primitive. */
export interface SwipeableProps {
  /** Enables gesture recognition. @default true */
  enabled?: boolean
  /** Selects touch dragging or desktop horizontal-wheel input. @default 'touch' */
  input?: SwipeableInput
  /** Selects the horizontal direction that commits the action. @default 'left' */
  direction?: SwipeableDirection
  /** Locks touch or wheel intent after this travel distance, in pixels. @default 8 */
  startDistance?: number
  /** Commits the action when the directed distance reaches this value, in pixels. @default 48 */
  threshold?: number
}

/** Reactive state exposed to the Swipeable default slot. */
export interface SwipeableSlotProps {
  /** True after the gesture has locked to the configured direction. */
  active: boolean
  /** Signed horizontal offset for the swipeable content, in pixels. */
  offset: number
  /** Progress from rest to the commit threshold, clamped from 0 to 1. */
  progress: number
  /** True while the current gesture meets the commit threshold. */
  thresholdCrossed: boolean
}
