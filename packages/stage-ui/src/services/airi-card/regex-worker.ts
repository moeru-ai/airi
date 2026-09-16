let scanText = ''

globalThis.onmessage = (event: MessageEvent<{ keys: string[], text?: string, caseSensitive: boolean }>) => {
  const { keys, text, caseSensitive } = event.data
  if (text !== undefined)
    scanText = text
  const matches = keys.some((key) => {
    try {
      const delimited = key.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/)
      const flags = [...new Set((delimited?.[2] ?? '') + (caseSensitive ? '' : 'i'))].join('')
      return new RegExp(delimited?.[1] ?? key, flags).test(scanText)
    }
    catch {
      return false
    }
  })
  globalThis.postMessage(matches)
}
