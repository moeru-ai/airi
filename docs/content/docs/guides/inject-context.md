---
title: Inject Context
description: Utilize `injectContext` to enhance component composition in Reka UI, enabling powerful and flexible UI development.
---

# Inject Context

<Description>

Utilize `injectContext` to enhance component composition in Reka UI, enabling powerful and flexible UI development.

</Description>

<Callout type="warning" title="Use with caution! API might change">

Reka UI exposes internal `injectContext` to further extend the ability to compose and construct complex components. However, this API was primarily designed to be internal use. Thus the API might change without notice.

</Callout>

## Introduction to `injectContext`

In Reka UI, all root component, and some other component exports an `injectContext` function, which is a key feature for managing component state and enabling seamless composition. This guide will show you how to craft your own child component based on the provided context.

## What is `injectContext`?

`injectContext` is a function provided by each Reka UI component that allows you to access the internal state and methods of that component.

It leverages Vue's [Provide / Inject](https://vuejs.org/guide/components/provide-inject) to provide a powerful way of extending and customizing component behavior.

## Basic Usage

Here's a simple example of how to use `injectContext` with a Reka UI Accordion component:

```vue
<!-- CustomAccordionContent.vue -->
<script setup>
import { injectAccordionItemContext, injectAccordionRootContext } from 'reka-ui'

const accordionRootContext = injectAccordionRootContext()
const accordionItemContext = injectAccordionItemContext()

const isSingleOpen = computed(() =>
  accordionRootContext.isSingle.value && accordionItemContext.open.value
)
</script>

<template>
  <div>
    …
  </div>
</template>
```

## Common Use Cases

1. **Custom Styling**: Access internal state to apply dynamic styles based on component state.
2. **Extended Functionality**: Build upon existing component logic to add new features.
3. **Complex Layouts**: Create intricate UI patterns by composing multiple components and sharing state between them.
4. **Accessibility Enhancements**: Utilize internal methods and state to improve keyboard navigation or screen reader support.

## Best Practices

1. Use `injectContext` in child components or composables, not in the component itself.
2. Always check if the injected context exists before using it, as it may be `undefined` if used outside the component's scope.
3. Prefer using provided props and events when possible, and use `injectContext` for more advanced scenarios.
4. When using TypeScript, leverage the type information provided by `injectContext` for better code quality.
