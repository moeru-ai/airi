---
name: transformer-directives
description: CSS directives @apply, @screen, theme(), and icon()
---

# Transformer Directives

Enables `@apply`, `@screen`, `theme()`, and `icon()` directives in CSS.

## Installation

```ts
import { defineConfig, transformerDirectives } from 'unocss'

export default defineConfig({
  transformers: [
    transformerDirectives(),
  ],
})
```

## @apply

Apply utility classes in CSS:

```css
.custom-btn {
  @apply py-2 px-4 font-semibold rounded-lg;
}

/* With variants - use quotes */
.custom-btn {
  @apply 'hover:bg-blue-600 focus:ring-2';
}
```

### CSS Custom Property Alternative

For vanilla CSS compatibility:

```css
.custom-div {
  --at-apply: text-center my-0 font-medium;
}
```

Supported aliases: `--at-apply`, `--uno-apply`, `--uno`

Configure aliases:

```ts
transformerDirectives({
  applyVariable: ['--at-apply', '--uno-apply', '--uno'],
  // or disable: applyVariable: false
})
```

## @screen

Create breakpoint media queries:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
}

@screen sm {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@screen lg {
  .grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

### Breakpoint Variants

```css
/* Less than breakpoint */
@screen lt-sm {
  .item { display: none; }
}

/* At specific breakpoint only */
@screen at-md {
  .item { width: 50%; }
}
```

## theme()

Access theme values in CSS:

```css
.btn-blue {
  background-color: theme('colors.blue.500');
  padding: theme('spacing.4');
  border-radius: theme('borderRadius.lg');
}
```

Dot notation paths into your theme config.

## icon()

Convert icon utility to SVG (requires preset-icons):

```css
.icon-sun {
  background-image: icon('i-carbon-sun');
}

/* With custom color */
.icon-moon {
  background-image: icon('i-carbon-moon', '#fff');
}

/* Using theme color */
.icon-alert {
  background-image: icon('i-carbon-warning', 'theme("colors.red.500")');
}
```

## Complete Example

```css
.card {
  @apply rounded-lg shadow-md p-4;
  background-color: theme('colors.white');
}

.card-header {
  @apply 'font-bold text-lg border-b';
  padding-bottom: theme('spacing.2');
}

@screen md {
  .card {
    @apply flex gap-4;
  }
}

.card-icon {
  background-image: icon('i-carbon-document');
  @apply w-6 h-6;
}
```

<!-- 
Source references:
- https://unocss.dev/transformers/directives
-->
