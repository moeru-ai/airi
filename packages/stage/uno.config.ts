import { defineConfig, mergeConfigs, presetWebFonts } from 'unocss'
// import presetTheme from 'unocss-preset-theme'
import UnoCSSConfig from '../../uno.config'

export default defineConfig(mergeConfigs([
  UnoCSSConfig,
  {
    presets: [
      // presetTheme({
      //   theme: {
      //     light: {
      //       colors: {
      //         primary: {
      //           50: 'var(--airi-theme-primary-50)',
      //           100: 'var(--airi-theme-primary-100)',
      //           200: 'var(--airi-theme-primary-200)',
      //           300: 'var(--airi-theme-primary-300)',
      //           400: 'var(--airi-theme-primary-400)',
      //           500: 'var(--airi-theme-primary-500)',
      //           600: 'var(--airi-theme-primary-600)',
      //           700: 'var(--airi-theme-primary-700)',
      //           800: 'var(--airi-theme-primary-800)',
      //           900: 'var(--airi-theme-primary-900)',
      //           950: 'var(--airi-theme-primary-950)',
      //         },
      //       },
      //     },
      //     dark: {
      //       colors: {
      //         primary: {
      //           50: 'var(--airi-theme-primary-50)',
      //           100: 'var(--airi-theme-primary-100)',
      //           200: 'var(--airi-theme-primary-200)',
      //           300: 'var(--airi-theme-primary-300)',
      //           400: 'var(--airi-theme-primary-400)',
      //           500: 'var(--airi-theme-primary-500)',
      //           600: 'var(--airi-theme-primary-600)',
      //           700: 'var(--airi-theme-primary-700)',
      //           800: 'var(--airi-theme-primary-800)',
      //           900: 'var(--airi-theme-primary-900)',
      //           950: 'var(--airi-theme-primary-950)',
      //         },
      //       },
      //     },
      //   },
      // }),
      presetWebFonts({
        fonts: {
          sans: 'DM Sans',
          serif: 'DM Serif Display',
          mono: 'DM Mono',
          cute: 'Kiwi Maru',
          cuteen: 'Sniglet',
        },
      }),
    ],
  },
]))
