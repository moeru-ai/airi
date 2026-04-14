import { onMounted } from 'vue'

import { markScenarioReady, resetScenarioReady } from '../runtime/ready'

async function waitForImageSource(source: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const image = new Image()

    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => reject(new Error(`Scenario image failed to load: ${source}`)), { once: true })
    image.src = source
  })
}

export function useSceneReady(sources: string[]): void {
  onMounted(async () => {
    resetScenarioReady()
    try {
      await Promise.all([
        document.fonts.ready,
        ...sources.map(source => waitForImageSource(source)),
      ])
      markScenarioReady()
    }
    catch (error) {
      console.error(error)
    }
  })
}
