import { useScriptTag } from '@vueuse/core'

/**
 * Loads the Cubism runtime before browser tests import Live2D consumers.
 * The Vite configuration must provide the SDK through DownloadLive2DSDK.
 * Each browser context keeps its runtime for the lifetime of the test page.
 */
if (!('Live2DCubismCore' in window)) {
  const { load } = useScriptTag('/assets/js/CubismSdkForWeb-5-r.3/Core/live2dcubismcore.min.js', undefined, { manual: true })

  // eslint-disable-next-line antfu/no-top-level-await
  await load()
}
