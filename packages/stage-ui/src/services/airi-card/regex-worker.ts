globalThis.onmessage = (event: MessageEvent<{ keys: string[], text: string, caseSensitive: boolean }>) => {
  const { keys, text, caseSensitive } = event.data
  const matches = keys.some((key) => {
    try {
      const delimited = key.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/)
      const flags = [...new Set((delimited?.[2] ?? '') + (caseSensitive ? '' : 'i'))].join('')
      return new RegExp(delimited?.[1] ?? key, flags).test(text)
    }
    catch {
      return false
    }
  })
  globalThis.postMessage(matches)
}
