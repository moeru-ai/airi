export function isAbsoluteUrl(url: string) {
  try {
    // This could be the most reliable way to check so using side-effect is acceptable
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  }
  catch {
    return false
  }
}
