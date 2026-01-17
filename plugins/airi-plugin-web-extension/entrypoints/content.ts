import { startContentObserver } from '../src/content'

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://*.youtu.be/*',
    '*://*.bilibili.com/*',
    '*://*.b23.tv/*',
  ],
  runAt: 'document_idle',
  main() {
    startContentObserver()
  },
})
