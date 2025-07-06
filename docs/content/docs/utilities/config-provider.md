---
title: Config Provider
description: Wraps your app to provide global configurations.
---

# Config Provider

<Description>
Wraps your app to provide global configurations.
</Description>

<Highlights
  :features="[
    'Enables all primitives to inherit global reading direction.',
    'Enables changing the behavior of scroll body when setting body lock.',
    'Much more controls to prevent layout shifts.',
  ]"
/>

## Anatomy

Import the component.

```vue
<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
</script>

<template>
  <ConfigProvider>
    <slot />
  </ConfigProvider>
</template>
```

## API Reference

### Config Provider

When creating localized apps that require right-to-left (RTL) reading direction, you need to wrap your application with the `ConfigProvider` component to ensure all of the primitives adjust their behavior based on the `dir` prop.

You can also change the global behavior of `bodylock` for components such as `Alert`, `DropdownMenu` and etc to fit your layout to prevent any [content shifts](https://github.com/unovue/reka-ui/issues/385).

<!-- @include: @/meta/ConfigProvider.md -->

## Example

Use the config provider.

Set global direction to `rtl`, and scroll body behavior to `false` (will not set any padding/margin).

```vue
<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
</script>

<template>
  <ConfigProvider
    dir="rtl"
    :scroll-body="false"
  >
    <slot />
  </ConfigProvider>
</template>
```

## Hydration issue (Vue < 3.5)

We expose a temporary workaround to allow current Nuxt (with version >3.10) project fix the current hydration issue by using [`useId`](https://nuxt.com/docs/api/composables/use-id) provided by Nuxt.

> Inspired by [Headless UI](https://github.com/tailwindlabs/headlessui/pull/2959)

 ```vue
 <!-- in Nuxt's app.vue -->
<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'

const useIdFunction = () => useId()
</script>

<template>
   <ConfigProvider :use-id="useIdFunction">
     …
   </ConfigProvider>
</template>
```
