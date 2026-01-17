import { startContentObserver } from '../src/content'

export default defineContentScript({
  matches: [
    '*://*/*',
  ],
  runAt: 'document_idle',
  main() {
    startContentObserver()
  },
})
