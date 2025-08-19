import type { Preset } from 'unocss'

import { presetChromatic } from '@proj-airi/unocss-preset-chromatic'
import { blackA, cyan, grass, green, indigo, mauve, purple, red, slate, teal, violet } from '@radix-ui/colors'
import { defineConfig, presetAttributify, presetIcons, presetTypography, presetWebFonts, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
  presets: [
    presetAttributify(),
    presetTypography({
      cssExtend: {
        'a': {
          'color': '#223f5dff',
          'text-decoration': 'underline',
          'text-decoration-style': 'dotted',
          'text-decoration-color': '#9fa4b1ff',
          'transition': 'color 0.2s ease-in-out',
        },
        'a:hover': {
          '--primary': '207 62% 59%',
          'color': 'hsl(var(--primary))',
        },
        '.dark a': {
          'color': '#9ca0a4',
          'text-decoration-color': '#4b5056',
        },
        'code::before': {
          content: 'normal',
        },
        'code::after': {
          content: 'normal',
        },
      },
    }),
    presetWind3(),
    presetWebFonts({
      fonts: {
        'sans': {
          name: 'DM Sans Variable',
          provider: 'none',
        },
        'serif': {
          name: 'DM Serif Display',
          provider: 'none',
        },
        'mono': {
          name: 'DM Mono',
          provider: 'none',
        },
        'sans-rounded': {
          name: 'Comfortaa Variable',
          provider: 'none',
        },
      },
    }),
    presetIcons(),
    presetChromatic({
      baseHue: 220.44,
      colors: {
        primary: 0,
        complementary: 180,
      },
    }) as Preset,
  ],
  content: {
    filesystem: [
      '.vitepress/**/*.{js,ts,vue}',
      'content/**/*.md',
    ],
  },
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
  theme: {
    fontFamily: {
      'sans': `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
      'sans-rounded': `"DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
    },
    colors: {
      border: 'hsl(var(--border))',
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      code: 'hsl(var(--code))',
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))',
      },
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))',
      },
      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))',
      },
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
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
    /**
     * https://github.com/unocss/unocss/blob/1031312057a3bea1082b7d938eb2ad640f57613a/packages-presets/preset-wind4/src/theme/animate.ts
     * https://unocss.dev/presets/wind4#transformdirectives
     */
    animation: {
      keyframes: {
        overlayShow: '{from{opacity:0}to{opacity:1}}',
        contentShow: '{from{opacity:0;transform:translate(-50%, -48%) scale(0.96)}to{opacity:1;transform:translate(-50%, -50%) scale(1)}}',
        slideDownAndFade: '{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:translateY(0)}}',
        slideLeftAndFade: '{from{opacity:0;transform:translateX(2px)}to{opacity:1;transform:translateX(0)}}',
        slideUpAndFade: '{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}',
        slideRightAndFade: '{from{opacity:0;transform:translateX(-2px)}to{opacity:1;transform:translateX(0)}}',
        slideDown: '{from{height:0}to{height:var(--reka-collapsible-content-height)}}',
        slideUp: '{from{height:var(--reka-collapsible-content-height)}to{height:0}}',
        enterFromRight: '{from{opacity:0;transform:translateX(200px)}to{opacity:1;transform:translateX(0)}}',
        enterFromLeft: '{from{opacity:0;transform:translateX(-200px)}to{opacity:1;transform:translateX(0)}}',
        exitToRight: '{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(200px)}}',
        exitToLeft: '{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-200px)}}',
        scaleIn: '{from{opacity:0;transform:rotateX(-10deg) scale(0.9)}to{opacity:1;transform:rotateX(0deg) scale(1)}}',
        scaleOut: '{from{opacity:1;transform:rotateX(0deg) scale(1)}to{opacity:0;transform:rotateX(-10deg) scale(0.95)}}',
        fadeIn: '{from{opacity:0}to{opacity:1}}',
        fadeOut: '{from{opacity:1}to{opacity:0}}',
        hide: '{from{opacity:1}to{opacity:0}}',
        slideIn: '{from{transform:translateX(calc(100% + var(--viewport-padding)))}to{transform:translateX(0)}}',
        swipeOut: '{from{transform:translateX(var(--reka-toast-swipe-end-x))}to{transform:translateX(calc(100% + var(--viewport-padding)))}}',
        text: '{0%,100%{background-size:200% 200%;background-position:left center}50%{background-size:200% 200%;background-position:right center}}',
        progress: '{0%{background-position:0 0}100%{background-position:30px 30px}}',
      },
      durations: {
        overlayShow: '150ms',
        contentShow: '150ms',
        slideDownAndFade: '400ms',
        slideLeftAndFade: '400ms',
        slideUpAndFade: '400ms',
        slideRightAndFade: '400ms',
        slideDown: '300ms',
        slideUp: '300ms',
        scaleIn: '200ms',
        scaleOut: '200ms',
        fadeIn: '200ms',
        fadeOut: '200ms',
        enterFromLeft: '250ms',
        enterFromRight: '250ms',
        exitToLeft: '250ms',
        exitToRight: '250ms',
        hide: '100ms',
        slideIn: '150ms',
        swipeOut: '100ms',
        text: '5s',
        progress: '1s',
      },
      timingFns: {
        overlayShow: 'cubic-bezier(0.16, 1, 0.3, 1)',
        contentShow: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideDownAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideLeftAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideUpAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideRightAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
        slideDown: 'cubic-bezier(0.87, 0, 0.13, 1)',
        slideUp: 'cubic-bezier(0.87, 0, 0.13, 1)',
        scaleIn: 'ease',
        scaleOut: 'ease',
        fadeIn: 'ease',
        fadeOut: 'ease',
        enterFromLeft: 'ease',
        enterFromRight: 'ease',
        exitToLeft: 'ease',
        exitToRight: 'ease',
        hide: 'ease-in',
        slideIn: 'cubic-bezier(0.16, 1, 0.3, 1)',
        swipeOut: 'ease-out',
        text: 'ease',
        progress: 'linear',
      },
      counts: {
        text: 'infinite',
        progress: 'infinite',
      },
    },
  },
  shortcuts: {
    'bg-gradient-radial': 'bg-gradient-radial-[var(--tw-gradient-stops)]',
  },
  rules: [
    [/^bg-gradient-radial-\[(.+)\]$/, ([, d]) => ({ 'background-image': `radial-gradient(${d})` })],
  ],
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
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
