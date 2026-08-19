if (!('Live2DCubismCore' in window)) {
  // eslint-disable-next-line antfu/no-top-level-await
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/assets/js/CubismSdkForWeb-5-r.3/Core/live2dcubismcore.min.js'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Failed to load the Live2D Cubism runtime.')), { once: true })
    document.head.appendChild(script)
  })
}

export {}
