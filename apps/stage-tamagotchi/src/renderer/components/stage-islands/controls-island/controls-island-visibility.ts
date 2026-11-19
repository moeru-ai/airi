/** What the Island reads to decide whether it hides. */
export interface ControlsIslandVisibilityState {
  /** The cursor is away from the stage window. The stage page decides this. */
  cursorAway: boolean
  /** A menu or a dialog of the Island is open, for example the app menu or Hearing controls. */
  overlayOpen: boolean
  /** A press that started on the Island has not ended, for example a window drag. */
  pressed: boolean
  /** The Island holds keyboard focus. */
  focused: boolean
}

/**
 * Tells whether the Island hides. It hides while the cursor is away from the stage window, unless the user still works
 * with it: in its menu or a dialog, with a press, or with the keyboard.
 *
 * @example
 * isControlsIslandConcealed({ cursorAway: true, overlayOpen: true, pressed: false, focused: false })
 * // => false
 */
export function isControlsIslandConcealed(state: ControlsIslandVisibilityState): boolean {
  return state.cursorAway && !state.overlayOpen && !state.pressed && !state.focused
}
