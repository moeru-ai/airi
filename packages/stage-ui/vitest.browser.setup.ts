// NOTICE:
// Browser test files run in parallel as separate documents of one origin, so they share `localStorage`.
// A browser fires a trusted `storage` event in every other document when one document writes. VueUse storage refs
// listen to it, so a setting that one test file writes, such as the microphone switch, changed stores in another
// file while its test ran. Tests then failed only when a certain other file ran at the same time.
// This listener drops the trusted events. A test that dispatches its own `StorageEvent` still reaches its listeners,
// because a dispatched event is not trusted.
// Remove this when Vitest gives each browser test file its own storage.
window.addEventListener('storage', (event) => {
  if (event.isTrusted)
    event.stopImmediatePropagation()
}, { capture: true })
