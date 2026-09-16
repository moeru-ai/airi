globalThis.onmessage = (event: MessageEvent<{ keys: string[], text: string, caseSensitive: boolean }>) => {
  const { keys, text, caseSensitive } = event.data
  try {
    const patterns = keys.map((key) => {
      const delimited = key.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/)
      const flags = [...new Set((delimited?.[2] ?? '') + (caseSensitive ? '' : 'i'))].join('')
      return new RegExp(delimited?.[1] ?? key, flags)
    })
    globalThis.postMessage(patterns.some(pattern => pattern.test(text)))
  }
  catch {
    globalThis.postMessage(false)
  }
}
