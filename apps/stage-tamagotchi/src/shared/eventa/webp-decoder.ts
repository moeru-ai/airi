import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Converts one WebP screenshot to PNG in the renderer that Chromium provides.
 *
 * Main sends base64 because the decoder window needs image bytes, not a file path.
 */
export const electronWebpScreenshotDecode = defineInvokeEventa<{ png: string }, { webp: string }>('eventa:invoke:electron:webp-screenshot:decode')
