---
name: preset-icons
description: Pure CSS icons using Iconify with any icon set
---

# Preset Icons

Use any icon as a pure CSS class, powered by Iconify.

## Installation

```bash
pnpm add -D @unocss/preset-icons @iconify-json/[collection-name]
```

Example: `@iconify-json/mdi` for Material Design Icons, `@iconify-json/carbon` for Carbon icons.

```ts
import { defineConfig, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetIcons(),
  ],
})
```

## Usage

Two naming conventions:
- `<prefix><collection>-<icon>` → `i-ph-anchor-simple-thin`
- `<prefix><collection>:<icon>` → `i-ph:anchor-simple-thin`

```html
<!-- Phosphor anchor icon -->
<div class="i-ph-anchor-simple-thin" />

<!-- Material Design alarm with color -->
<div class="i-mdi-alarm text-orange-400" />

<!-- Large Vue logo -->
<div class="i-logos-vue text-3xl" />

<!-- Dynamic: Sun in light mode, Moon in dark -->
<button class="i-carbon-sun dark:i-carbon-moon" />

<!-- Hover effect -->
<div class="i-twemoji-grinning-face-with-smiling-eyes hover:i-twemoji-face-with-tears-of-joy" />
```

Browse icons at [icones.js.org](https://icones.js.org/) or [Iconify](https://icon-sets.iconify.design/).

## Icon Modes

Icons automatically choose between `mask` (monochrome) and `background-img` (colorful).

### Force Specific Mode

- `?mask` - Render as mask (colorable with `currentColor`)
- `?bg` - Render as background image (preserves original colors)

```html
<!-- Original with colors -->
<div class="i-vscode-icons:file-type-light-pnpm" />

<!-- Force mask mode, apply custom color -->
<div class="i-vscode-icons:file-type-light-pnpm?mask text-red-300" />
```

## Options

```ts
presetIcons({
  scale: 1.2,              // Scale relative to font size
  prefix: 'i-',            // Class prefix (default)
  mode: 'auto',            // 'auto' | 'mask' | 'bg'
  extraProperties: {
    'display': 'inline-block',
    'vertical-align': 'middle',
  },
  warn: true,              // Warn on missing icons
  autoInstall: true,       // Auto-install missing icon sets
  cdn: 'https://esm.sh/',  // CDN for browser usage
})
```

## Custom Icon Collections

### Inline SVGs

```ts
presetIcons({
  collections: {
    custom: {
      circle: '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50"></circle></svg>',
    },
  }
})
```

Usage: `<span class="i-custom:circle"></span>`

### File System Loader

```ts
import { FileSystemIconLoader } from '@iconify/utils/lib/loader/node-loaders'

presetIcons({
  collections: {
    'my-icons': FileSystemIconLoader(
      './assets/icons',
      svg => svg.replace(/#fff/, 'currentColor')
    ),
  }
})
```

### Dynamic Import (Browser)

```ts
import presetIcons from '@unocss/preset-icons/browser'

presetIcons({
  collections: {
    carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
  }
})
```

## Icon Customization

```ts
presetIcons({
  customizations: {
    // Transform SVG
    transform(svg, collection, icon) {
      return svg.replace(/#fff/, 'currentColor')
    },
    // Global sizing
    customize(props) {
      props.width = '2em'
      props.height = '2em'
      return props
    },
    // Per-collection
    iconCustomizer(collection, icon, props) {
      if (collection === 'mdi') {
        props.width = '2em'
      }
    }
  }
})
```

## CSS Directive

Use `icon()` in CSS (requires transformer-directives):

```css
.icon {
  background-image: icon('i-carbon-sun');
}
.icon-colored {
  background-image: icon('i-carbon-moon', '#fff');
}
```

## Accessibility

```html
<!-- With label -->
<a href="/profile" aria-label="Profile" class="i-ph:user-duotone"></a>

<!-- Decorative -->
<a href="/profile">
  <span aria-hidden="true" class="i-ph:user-duotone"></span>
  My Profile
</a>
```

<!-- 
Source references:
- https://unocss.dev/presets/icons
-->
