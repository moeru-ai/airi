import { defineConfig, presetWind3 } from 'unocss'

/**
 * UnoCSS config for the chess gamelet UI.
 *
 * The gamelet renders in its own sandboxed iframe, so it carries a standalone
 * UnoCSS setup rather than sharing the AIRI stage config. It mirrors the
 * stage's Wind3 preset to keep utility-class semantics consistent.
 */
export default defineConfig({
  presets: [presetWind3()],
})
