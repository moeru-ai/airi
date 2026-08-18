---
name: transformer-compile-class
description: Compile multiple classes into one hashed class
---

# Transformer Compile Class

Compiles multiple utility classes into a single hashed class for smaller HTML.

## Installation

```ts
import { defineConfig, transformerCompileClass } from 'unocss'

export default defineConfig({
  transformers: [
    transformerCompileClass(),
  ],
})
```

## Usage

Add `:uno:` prefix to mark classes for compilation:

```html
<!-- Before -->
<div class=":uno: text-center sm:text-left">
  <div class=":uno: text-sm font-bold hover:text-red" />
</div>

<!-- After -->
<div class="uno-qlmcrp">
  <div class="uno-0qw2gr" />
</div>
```

## Generated CSS

```css
.uno-qlmcrp {
  text-align: center;
}
.uno-0qw2gr {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 700;
}
.uno-0qw2gr:hover {
  --un-text-opacity: 1;
  color: rgb(248 113 113 / var(--un-text-opacity));
}
@media (min-width: 640px) {
  .uno-qlmcrp {
    text-align: left;
  }
}
```

## Options

```ts
transformerCompileClass({
  // Custom trigger string (default: ':uno:')
  trigger: ':uno:',
  
  // Custom class prefix (default: 'uno-')
  classPrefix: 'uno-',
  
  // Hash function for class names
  hashFn: (str) => /* custom hash */,
  
  // Keep original classes alongside compiled
  keepOriginal: false,
})
```

## Use Cases

- **Smaller HTML** - Reduce repetitive class strings
- **Obfuscation** - Hide utility class names in production
- **Performance** - Fewer class attributes to parse

## ESLint Integration

Enforce compile class usage across project:

```json
{
  "rules": {
    "@unocss/enforce-class-compile": "warn"
  }
}
```

This rule:
- Warns when class attribute doesn't start with `:uno:`
- Auto-fixes by adding the prefix

Options:

```json
{
  "rules": {
    "@unocss/enforce-class-compile": ["warn", {
      "prefix": ":uno:",
      "enableFix": true
    }]
  }
}
```

## Combining with Other Transformers

```ts
export default defineConfig({
  transformers: [
    transformerVariantGroup(),  // Process variant groups first
    transformerDirectives(),    // Then directives
    transformerCompileClass(),  // Compile last
  ],
})
```

<!-- 
Source references:
- https://unocss.dev/transformers/compile-class
-->
