import { defineConfig, presetTypography, presetUno, presetWebFonts } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'Inter',
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    }),
  ],
  theme: {
    colors: {
      primary: {
        DEFAULT: '#6366f1',
        dark: '#4f46e5',
        light: '#c7d2fe',
      },
      secondary: {
        DEFAULT: '#ec4899',
        light: '#fbcfe8',
      },
      dark: '#1e293b',
      light: '#f8fafc',
      gray: '#64748b',
      bg: '#f1f5f9',
    },
  },
})
