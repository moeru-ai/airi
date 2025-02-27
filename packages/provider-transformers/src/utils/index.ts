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
