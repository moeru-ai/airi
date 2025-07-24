export default defineBackground(() => {
  // eslint-disable-next-line no-console
  console.log('Hello background!', { id: browser.runtime.id })
})
