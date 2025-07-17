export default defineContentScript({
  matches: ['*://*.google.com/*'],
  main() {
    // eslint-disable-next-line no-console
    console.log('Hello content.')
  },
})
