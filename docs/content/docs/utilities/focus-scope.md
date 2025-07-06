---
title: Focus Scope
description:  Manages focus within a component boundary with support for trapping and looping focus navigation.
---

# Focus Scope

<Description>
 Manages focus within a component boundary with support for trapping and looping focus navigation.
</Description>

Focus Scope provides enhanced control over keyboard focus management within component boundaries. It can trap focus within its container and optionally loop focus navigation, making it ideal for modal interfaces and other interactive components that need to manage focus states.

## API Reference

<!-- @include: @/meta/FocusScope.md -->

## Example

Basic usage with focus trapping

```vue line=2
<template>
  <FocusScope :trapped="true">
    <div>
      <button>Action 1</button>
      <button>Action 2</button>
      <button>Close</button>
    </div>
  </FocusScope>
</template>
```

### With Focus Looping

Enable both trapping and looping for complete focus management:

```vue line=2
<template>
  <FocusScope :trapped="true" :loop="true">
    <div>
      <button v-for="item in items" :key="item.id">
        {{ item.label }}
      </button>
    </div>
  </FocusScope>
</template>
```

### Handling Focus Event

```vue line=2-5
<script setup>
function handleMountFocus(event) {
  // Prevent default auto-focus behavior if needed
  event.preventDefault()
}
</script>

<template>
  <FocusScope
    @mount-auto-focus="handleMountFocus"
    @unmount-auto-focus="handleUnmountFocus"
  >
    <div>
      …
    </div>
  </FocusScope>
</template>
```

<br>

<Callout type="warning">

When using trapped mode, ensure there is always at least one focusable element within the scope to prevent focus from being trapped in an inaccessible state.

</Callout>
