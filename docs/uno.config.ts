import type { Preset } from 'unocss'

import { presetChromatic } from '@proj-airi/unocss-preset-chromatic'
import { blackA, cyan, grass, green, indigo, mauve, purple, red, slate, teal, violet } from '@radix-ui/colors'
import { defineConfig, presetAttributify, presetIcons, presetTypography, presetWebFonts, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig<object>({
  content: {
    filesystem: [
      '.vitepress/**/*.{js,ts,vue}',
      'content/**/*.md',
    ],
  },
  preflights: [
    {
      getCSS: () => {
        return `
html,:host {
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
    -moz-tab-size: 4;
    -o-tab-size: 4;
    tab-size: 4;
    font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    font-feature-settings: normal;
    font-variation-settings: normal;
    -webkit-tap-highlight-color: transparent
}

code,kbd,samp,pre {
    font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-feature-settings: normal;
    font-variation-settings: normal;
    font-size: 1em
}
        `
      },
    },
  ],
  presets: [
    presetAttributify(),
    presetTypography({
      cssExtend: {
        '.dark a': {
          'color': '#9ca0a4',
          'text-decoration-color': '#4b5056',
        },
        '.dark details': {
          'background-color': '#191c1e',
        },
        'a': {
          'color': '#223f5dff',
          'text-decoration': 'underline',
          'text-decoration-color': '#9fa4b1ff',
          'text-decoration-style': 'dotted',
          'transition': 'color 0.2s ease-in-out',
        },
        'a:hover': {
          '--primary': '207 62% 59%',
          'color': 'hsl(var(--primary))',
        },
        'code::after': {
          content: 'normal',
        },
        'code::before': {
          content: 'normal',
        },
        'details': {
          'background-color': '#a6ceef1a',
          'margin-bottom': '0.5rem',
          'margin-top': '0.5rem',
          'padding': '0.5rem 1rem',
        },
        'h1': {
          'margin-bottom': '1rem',
        },
        'li': {
          'margin-bottom': '0',
          'margin-top': '0',
        },
        'li blockquote': {
          'margin-bottom': '1rem',
          'margin-top': '1rem',
        },
        'li p': {
          'margin-bottom': '0.25rem',
          'margin-top': '0.25rem',
        },
        'ol': {
          'margin-bottom': '0.25rem',
          'margin-top': '0.25rem',
          'padding-inline-start': '1.25rem',
        },
        'ol li': {
          'padding-inline-start': '0.25rem',
        },
        'p': {
          'margin-bottom': '0.5rem',
          'margin-top': '0.5rem',
        },
        'pre': {
          'margin-bottom': '0',
          'margin-top': '0.5rem',
        },
        'ul': {
          'margin-bottom': '0.25rem',
          'margin-top': '0.25rem',
          'padding-inline-start': '1.25rem',
        },
        'ul li': {
          'padding-inline-start': '0.25rem',
        },
      },
    }),
    presetWind3(),
    presetWebFonts({
      fonts: {
        'grandstander': {
          name: 'Grandstander',
        },
        'mono': {
          name: 'DM Mono',
          provider: 'none',
        },
        'mystery-quest': {
          name: 'Mystery Quest',
        },
        'sans': {
          name: 'DM Sans Variable',
          provider: 'none',
        },
        'sans-rounded': {
          name: 'Comfortaa Variable',
          provider: 'none',
        },
        'serif': {
          name: 'DM Serif Display',
          provider: 'none',
        },
      },
    }),
    presetIcons(),
    // NOTICE:
    // This cast bridges the preset's bundled UnoCSS declarations to the workspace declarations.
    // Version 1.1.4 embeds @unocss/core types in its generated shared declaration file.
    // Source: node_modules/@proj-airi/unocss-preset-chromatic/dist/shared-3Rd5ey9i.d.mts.
    // Remove this when the package emits imports for UnoCSS types instead of bundling them.
    presetChromatic({
      baseHue: 220.44,
      colors: {
        complementary: 180,
        primary: 0,
      },
    }) as unknown as Preset<object>,
  ],
  rules: [
    [/^bg-gradient-radial-\[(.+)\]$/, ([, d]) => ({ 'background-image': `radial-gradient(${d})` })],
  ],
  safelist: [
    '-ml-8',
    'top-0',
    'hidden',
    'border-0',
    'opacity-0',
    'group-hover:opacity-100',
    'focus:opacity-100',
    'lg:flex',
    'transition-opacity',
    'duration-200',
    'ease-in-out',
    '[&_span]:focus:opacity-100',
    '[&_span_>_span]:focus:outline',
  ],
  shortcuts: {
    'bg-gradient-radial': 'bg-gradient-radial-[var(--tw-gradient-stops)]',
  },
  theme: {
    /**
     * https://github.com/unocss/unocss/blob/1031312057a3bea1082b7d938eb2ad640f57613a/packages-presets/preset-wind4/src/theme/animate.ts
     * https://unocss.dev/presets/wind4#transformdirectives
     */
    animation: {
      counts: {
        progress: 'infinite',
        text: 'infinite',
      },
      durations: {
        contentShow: '150ms',
        enterFromLeft: '250ms',
        enterFromRight: '250ms',
        exitToLeft: '250ms',
        exitToRight: '250ms',
        fadeIn: '200ms',
        fadeOut: '200ms',
        hide: '100ms',
        overlayShow: '150ms',
        progress: '1s',
        scaleIn: '200ms',
        scaleOut: '200ms',
        slideDown: '300ms',
        slideDownAndFade: '400ms',
        slideIn: '150ms',
        slideLeftAndFade: '400ms',
        slideRightAndFade: '400ms',
        slideUp: '300ms',
        slideUpAndFade: '400ms',
        swipeOut: '100ms',
        text: '5s',
      },
      keyframes: {
        contentShow: '{from{opacity:0;transform:translate(-50%, -48%) scale(0.96)}to{opacity:1;transform:translate(-50%, -50%) scale(1)}}',
        enterFromLeft: '{from{opacity:0;transform:translateX(-200px)}to{opacity:1;transform:translateX(0)}}',
        enterFromRight: '{from{opacity:0;transform:translateX(200px)}to{opacity:1;transform:translateX(0)}}',
        exitToLeft: '{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-200px)}}',
        exitToRight: '{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(200px)}}',
        fadeIn: '{from{opacity:0}to{opacity:1}}',
        fadeOut: '{from{opacity:1}to{opacity:0}}',
        hide: '{from{opacity:1}to{opacity:0}}',
        overlayShow: '{from{opacity:0}to{opacity:1}}',
        progress: '{0%{background-position:0 0}100%{background-position:30px 30px}}',
        scaleIn: '{from{opacity:0;transform:rotateX(-10deg) scale(0.9)}to{opacity:1;transform:rotateX(0deg) scale(1)}}',
        scaleOut: '{from{opacity:1;transform:rotateX(0deg) scale(1)}to{opacity:0;transform:rotateX(-10deg) scale(0.95)}}',
        slideDown: '{from{height:0}to{height:var(--reka-collapsible-content-height)}}',
        slideDownAndFade: '{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:translateY(0)}}',
        slideIn: '{from{transform:translateX(calc(100% + var(--viewport-padding)))}to{transform:translateX(0)}}',
        slideLeftAndFade: '{from{opacity:0;transform:translateX(2px)}to{opacity:1;transform:translateX(0)}}',
        slideRightAndFade: '{from{opacity:0;transform:translateX(-2px)}to{opacity:1;transform:translateX(0)}}',
        slideUp: '{from{height:var(--reka-collapsible-content-height)}to{height:0}}',
        slideUpAndFade: '{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}',
        swipeOut: '{from{transform:translateX(var(--reka-toast-swipe-end-x))}to{transform:translateX(calc(100% + var(--viewport-padding)))}}',
        text: '{0%,100%{background-size:200% 200%;background-position:left center}50%{background-size:200% 200%;background-position:right center}}',
      },
      timingFns: {
        contentShow: 'cubic-bezier(0.16, 1, 0.3, 1)',
        enterFromLeft: 'ease',
        enterFromRight: 'ease',
        exitToLeft: 'ease',
        exitToRight: 'ease',
        fadeIn: 'ease',
        fadeOut: 'ease',
        hide: 'ease-in',
        overlayShow: 'cubic-bezier(0.16, 1, 0.3, 1)',
        progress: 'linear',
        scaleIn: 'ease',
        scaleOut: 'ease',
        slideDown: 'cubic-bezier(0.87, 0, 0.13, 1)',
        slideDownAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideIn: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideLeftAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideRightAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideUp: 'cubic-bezier(0.87, 0, 0.13, 1)',
        slideUpAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        swipeOut: 'ease-out',
        text: 'ease',
      },
    },
    colors: {
      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))',
      },
      background: 'hsl(var(--background))',
      border: 'hsl(var(--border))',
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
      },
      code: 'hsl(var(--code))',
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },
      foreground: 'hsl(var(--foreground))',
      input: 'hsl(var(--input))',
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))',
      },
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      ring: 'hsl(var(--ring))',
      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))',
      },
      ...blackA,
      ...mauve,
      ...violet,
      ...green,
      ...red,
      ...grass,
      ...teal,
      ...cyan,
      ...indigo,
      ...purple,
      ...slate,
    },
    fontFamily: {
      'sans': `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
      'sans-rounded': `"DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
      'sans-serif-halloween': `"Mystery Quest", "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
      'sans-serif-halloween-secondary': `"Grandstander", "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
    },
  },
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
