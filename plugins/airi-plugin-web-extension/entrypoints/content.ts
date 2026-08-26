import { startContentObserver } from '../src/content'

export default defineContentScript({
  main() {
    startContentObserver()
  },
  matches: [
    '*://*/*',
  ],
  runAt: 'document_idle',
})
