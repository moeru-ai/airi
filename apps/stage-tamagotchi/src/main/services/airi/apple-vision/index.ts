import type { Lifecycle } from 'injeca'

import { useLogg } from '@guiiai/logg'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { setupAppleVision } from '@xsai-apple-vision/vision-electron-plugin/main'
import { ipcMain } from 'electron'
import { isMacOS } from 'std-env'

/**
 * Registers the app-wide Apple Vision transport and its native Provider.
 *
 * The Electron main process owns native work. Renderer Providers communicate
 * with it through the Eventa handlers registered by the xsAI plugin.
 * Non-macOS hosts return an inactive service without loading the native package.
 *
 * The Provider reads small text in screenshots with the built-in OCR tool.
 * The first OCR call compiles the OCR models for this app, which takes about a
 * minute. The service prepares them in the background after the first check
 * that finds the model available, so a Mac that cannot run the model never
 * compiles them.
 *
 * The preparation runs once for each app start. A failed preparation logs a
 * warning, and the first OCR call then compiles the models. Dispose does not
 * cancel a preparation in progress, because the addon cannot cancel it.
 *
 * Call stack:
 *
 * setupAppleVisionService
 *   -> {@link createContext}
 *     -> {@link setupAppleVision}
 *       -> {@link createAppleVisionProvider}
 */
export async function setupAppleVisionService(options: { lifecycle: Lifecycle }) {
  if (!isMacOS)
    return { dispose: () => {} }

  const log = useLogg('main/apple-vision').useGlobalConfig()
  const { createAppleVisionProvider } = await import('@xsai-apple-vision/vision-native')
  const nativeProvider = createAppleVisionProvider({ builtInTools: { ocr: true, barcode: false } })
  let preparation: Promise<void> | undefined

  const provider: typeof nativeProvider = {
    ...nativeProvider,
    async isAvailable() {
      const availability = await nativeProvider.isAvailable()
      if (availability.available) {
        preparation ??= nativeProvider.prepare().catch((error) => {
          log.withError(error).warn('Could not prepare the OCR models')
        })
      }
      return availability
    },
  }

  const eventa = createContext(ipcMain)
  const setup = setupAppleVision({ context: eventa.context, provider })

  const dispose = () => {
    // Remove the handlers before the transport stops.
    setup.dispose()
    eventa.dispose()
  }

  options.lifecycle.appHooks.onStop(dispose)

  return { dispose }
}
