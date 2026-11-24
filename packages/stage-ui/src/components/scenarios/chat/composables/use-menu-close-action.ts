/**
 * Runs the action of a menu item after its menu closes.
 *
 * A closing menu returns focus to its trigger. An action that opens a field, for example a rename, runs in place of
 * that return, so the field keeps focus. Call `request` in the `select` handler of the item, and bind
 * `onCloseAutoFocus` to the `closeAutoFocus` event of the menu. A menu that closes without a request returns focus as
 * usual.
 */
export function useMenuCloseAction() {
  let pending: (() => void) | undefined

  function request(action: () => void) {
    pending = action
  }

  function onCloseAutoFocus(event: Event) {
    const action = pending
    if (!action)
      return
    pending = undefined
    event.preventDefault()
    action()
  }

  return { request, onCloseAutoFocus }
}
