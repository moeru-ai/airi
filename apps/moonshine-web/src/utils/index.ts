export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh', {
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    fractionalSecondDigits: 3,
  })
}

export async function supportsWebGPU() {
  try {
    if (!('gpu' in navigator) || !navigator.gpu)
      return false

    await navigator.gpu.requestAdapter()
    return true
  }
  catch (e) {
    console.error(e)
    return false
  }
}
